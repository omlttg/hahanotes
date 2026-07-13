import os
import hashlib
import httpx
import asyncio
from pydub import AudioSegment

# Default voice IDs from ElevenLabs
DEFAULT_ROOKIE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Bella (trẻ trung)
DEFAULT_CYNIC_VOICE_ID = "ErXwobaYiN019PkySvjV"   # Antoni (nam trầm ấm, mỉa mai, hoạt động 100%)

# URLs cho assets nhạc nền và hiệu ứng
BG_MUSIC_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3"  # Nhạc nền nhẹ nhàng
LAUGH_SFX_URL = "https://raw.githubusercontent.com/jitsi/jitsi-meet/master/sounds/reactions-laughter.mp3"  # Tiếng cười hiệu ứng

# Lock toàn cục để tránh xung đột ghi đè file cache đồng thời
_audio_write_lock = asyncio.Lock()

# Biến cờ toàn cục dùng làm Circuit Breaker để ngắt mạch ElevenLabs
# Nếu ElevenLabs hết quota hoặc sai key (mã lỗi 400, 401, 403), cờ này được bật
# để toàn bộ các lượt gọi sau chuyển thẳng sang gTTS, tránh bị Vercel Serverless Timeout (10 giây)
ELEVENLABS_DISABLED = False

def is_valid_mp3(file_path: str) -> bool:
    """
    Kiểm tra xem tệp mp3 có tồn tại, có dung lượng hợp lệ (> 1000 bytes)
    và có cấu trúc header MP3 hợp lệ hay không (không phụ thuộc vào ffmpeg/pydub).
    """
    if not os.path.exists(file_path):
        return False
    try:
        size = os.path.getsize(file_path)
        if size < 1000:  # File quá nhỏ
            return False
            
        with open(file_path, "rb") as f:
            header = f.read(4)
            
        if len(header) < 4:
            return False
            
        # Kiểm tra ID3 header (b"ID3") hoặc MP3 sync word (0xFF và 3 bit cao của byte tiếp theo là 1)
        is_id3 = header[:3] == b"ID3"
        is_sync = header[0] == 0xFF and (header[1] & 0xE0) == 0xE0
        
        return is_id3 or is_sync
    except Exception:
        return False

def get_voice_id(speaker: str) -> str:
    """
    Trả về Voice ID tương ứng cho Rookie hoặc Cynic từ biến môi trường
    hoặc dùng các giá trị mặc định.
    """
    speaker_lower = speaker.lower().strip()
    if "rookie" in speaker_lower:
        return os.getenv("ELEVENLABS_ROOKIE_VOICE_ID", DEFAULT_ROOKIE_VOICE_ID)
    else:
        return os.getenv("ELEVENLABS_CYNIC_VOICE_ID", DEFAULT_CYNIC_VOICE_ID)

def get_cache_dir() -> str:
    """
    Trả về thư mục cache ghi được. Ở local dùng static/audio, trên Vercel dùng /tmp/hahanotes_cache.
    """
    # Vercel Free Serverless chỉ cho phép ghi vào /tmp
    if os.getenv("VERCEL") or not os.access(os.path.dirname(os.path.abspath(__file__)), os.W_OK):
        cache_dir = "/tmp/hahanotes_cache"
    else:
        cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "audio")
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir

def get_assets_dir() -> str:
    """
    Trả về thư mục assets ghi được. Trên Vercel dùng /tmp/assets, ở local dùng static/assets.
    """
    if os.getenv("VERCEL") or not os.access(os.path.dirname(os.path.abspath(__file__)), os.W_OK):
        assets_dir = "/tmp/assets"
    else:
        assets_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "assets")
    os.makedirs(assets_dir, exist_ok=True)
    return assets_dir

def ensure_ffmpeg():
    """
    Đảm bảo ffmpeg khả dụng trên Vercel bằng cách:
    1. Kiểm tra ffmpeg trên hệ thống.
    2. Kiểm tra prebuilt ffmpeg (được tải ở build-time trong api/bin/ffmpeg).
    3. Tải static binary từ nguồn uy tín vào /tmp/bin khi chạy ở runtime (fallback cuối cùng).
    """
    import urllib.request
    import shutil
    import stat
    
    # 1. Kiểm tra xem ffmpeg đã có trên hệ thống chưa
    if shutil.which("ffmpeg"):
        print("✓ [FFmpeg] Đã tìm thấy ffmpeg trên hệ thống.")
        try:
            AudioSegment.converter = shutil.which("ffmpeg")
        except Exception as e:
            print(f"! [FFmpeg Warning] Lỗi cấu hình AudioSegment.converter từ hệ thống: {e}")
        return True

    # 2. Kiểm tra prebuilt ffmpeg được tải ở build-time (giúp cold start 0s)
    api_dir = os.path.dirname(os.path.abspath(__file__))
    prebuilt_dir = os.path.join(api_dir, "bin")
    prebuilt_ffmpeg = os.path.join(prebuilt_dir, "ffmpeg")
    if os.path.exists(prebuilt_ffmpeg):
        try:
            # Cấp quyền thực thi nếu chưa có
            st = os.stat(prebuilt_ffmpeg)
            os.chmod(prebuilt_ffmpeg, st.st_mode | stat.S_IEXEC)
            AudioSegment.converter = prebuilt_ffmpeg
            # Thêm prebuilt_dir vào PATH để pydub có thể tìm thấy
            if prebuilt_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = prebuilt_dir + os.pathsep + os.environ.get("PATH", "")
            print("✓ [FFmpeg] Sử dụng prebuilt ffmpeg thành công tại:", prebuilt_ffmpeg)
            return True
        except Exception as e:
            print(f"! [FFmpeg Warning] Lỗi cấu hình prebuilt ffmpeg: {e}")
        
    bin_dir = "/tmp/bin"
    ffmpeg_path = os.path.join(bin_dir, "ffmpeg")
    ffmpeg_tmp = os.path.join(bin_dir, "ffmpeg.tmp")
    
    # Thêm bin_dir vào PATH để pydub có thể tự tìm thấy
    if bin_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
        
    if os.path.exists(ffmpeg_path):
        print("✓ [FFmpeg] Đã có sẵn static ffmpeg trong /tmp/bin.")
        try:
            AudioSegment.converter = ffmpeg_path
        except Exception as e:
            print(f"! [FFmpeg Warning] Lỗi cấu hình AudioSegment.converter từ /tmp/bin: {e}")
        return True
        
    print("⏳ [FFmpeg] Không tìm thấy ffmpeg. Bắt đầu tải static binary cho Linux x64...")
    os.makedirs(bin_dir, exist_ok=True)
    
    url = "https://github.com/eugeneware/ffmpeg-static/releases/download/b4.2.2/linux-x64"
    
    try:
        import ssl
        # Bỏ qua kiểm tra chứng chỉ SSL để tránh lỗi trên các container Vercel thiếu certs
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, context=ctx, timeout=30) as response, open(ffmpeg_tmp, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
            
        # Đổi tên file tạm thành chính thức
        os.rename(ffmpeg_tmp, ffmpeg_path)
            
        # Cấp quyền thực thi cho binary
        st = os.stat(ffmpeg_path)
        os.chmod(ffmpeg_path, st.st_mode | stat.S_IEXEC)
        
        # Gán trực tiếp AudioSegment.converter cho chắc chắn
        AudioSegment.converter = ffmpeg_path
        print("✓ [FFmpeg] Tải và cấu hình ffmpeg static thành công tại:", ffmpeg_path)
        return True
    except Exception as e:
        print(f"✗ [FFmpeg Error] Không thể tải static ffmpeg: {e}")
        if os.path.exists(ffmpeg_tmp):
            try: os.remove(ffmpeg_tmp)
            except: pass
        return False

def wait_for_ffmpeg(timeout_seconds: int = 15):
    """
    Đợi cho đến khi ffmpeg sẵn sàng hoạt động (tối đa timeout_seconds giây).
    """
    import shutil
    import time
    
    # 1. Kiểm tra hệ thống
    if shutil.which("ffmpeg"):
        try:
            AudioSegment.converter = shutil.which("ffmpeg")
        except Exception:
            pass
        return True
        
    # 2. Kiểm tra prebuilt ffmpeg
    api_dir = os.path.dirname(os.path.abspath(__file__))
    prebuilt_dir = os.path.join(api_dir, "bin")
    prebuilt_ffmpeg = os.path.join(prebuilt_dir, "ffmpeg")
    if os.path.exists(prebuilt_ffmpeg):
        try:
            st = os.stat(prebuilt_ffmpeg)
            os.chmod(prebuilt_ffmpeg, st.st_mode | stat.S_IEXEC)
            AudioSegment.converter = prebuilt_ffmpeg
            if prebuilt_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = prebuilt_dir + os.pathsep + os.environ.get("PATH", "")
            return True
        except Exception:
            pass

    bin_dir = "/tmp/bin"
    ffmpeg_path = os.path.join(bin_dir, "ffmpeg")
    
    if bin_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
        
    if os.path.exists(ffmpeg_path):
        try:
            AudioSegment.converter = ffmpeg_path
        except Exception:
            pass
        return True
        
    start_time = time.time()
    print("⏳ [FFmpeg] Đang chờ tải ffmpeg hoàn tất...")
    while time.time() - start_time < timeout_seconds:
        if os.path.exists(ffmpeg_path):
            if os.access(ffmpeg_path, os.X_OK):
                try:
                    AudioSegment.converter = ffmpeg_path
                except Exception:
                    pass
                print("✓ [FFmpeg] FFmpeg đã sẵn sàng hoạt động!")
                return True
        time.sleep(0.5)
        
    print("✗ [FFmpeg] Quá thời gian chờ ffmpeg.")
    return False


def clean_old_cache(cache_dir: str, max_size_mb: int = 300):
    """
    Dọn dẹp cache LRU để tránh đầy phân vùng /tmp (giới hạn 512MB trên Vercel).
    """
    try:
        files = []
        total_size = 0
        for f in os.listdir(cache_dir):
            if f.endswith(".mp3"):
                path = os.path.join(cache_dir, f)
                try:
                    stat_info = os.stat(path)
                    files.append((path, stat_info.st_atime, stat_info.st_size))
                    total_size += stat_info.st_size
                except OSError:
                    continue
                    
        max_bytes = max_size_mb * 1024 * 1024
        if total_size > max_bytes:
            print(f"[LRU Cache] Tổng dung lượng {total_size / (1024*1024):.2f}MB vượt quá {max_size_mb}MB. Tiến hành dọn dẹp...")
            # Sắp xếp theo thời gian truy cập tăng dần (cũ nhất đứng trước)
            files.sort(key=lambda x: x[1])
            target_size = int(max_bytes * 0.8) # Giảm xuống còn 80% dung lượng tối đa
            for path, _, size in files:
                try:
                    os.remove(path)
                    total_size -= size
                    print(f"[LRU Cache] Đã xóa file cũ: {os.path.basename(path)}")
                    if total_size <= target_size:
                        break
                except OSError as e:
                    print(f"[LRU Cache Error] Không xóa được {path}: {e}")
    except Exception as e:
        print(f"[LRU Cache Exception] Lỗi dọn dẹp cache: {e}")

async def _generate_gtts_fallback_internal(text: str, speaker: str, filename: str, file_path: str) -> str:
    """
    Helper thực hiện gọi gTTS và ghi file âm thanh.
    Có cơ chế tự động thử lại 3 lần và xác thực tệp vừa lưu.
    """
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            from gtts import gTTS
            tld = "com" if speaker.lower().strip() == "rookie" else "co.uk"
            tts = gTTS(text=text, lang="en", tld=tld)
            
            # Ghi file thông qua chạy đồng bộ an toàn trong thread pool
            await asyncio.to_thread(tts.save, file_path)
            
            # Xác thực file vừa lưu xem có hợp lệ không
            if is_valid_mp3(file_path):
                print(f"✓ [TTS Fallback Success] Đã sinh và lưu file cache bằng gTTS (Lần thử {attempt}): {filename}")
                return filename
            else:
                raise ValueError("Tệp gTTS sinh ra bị hỏng.")
        except Exception as fallback_err:
            print(f"⚠️ [TTS Fallback Error] Lỗi gTTS lần thử {attempt}: {fallback_err}")
            if os.path.exists(file_path):
                try: os.remove(file_path)
                except: pass
            if attempt == max_retries:
                return ""
            await asyncio.sleep(attempt * 0.5)
    return ""

async def _generate_edge_tts_fallback(text: str, speaker: str, filename: str, file_path: str) -> bool:
    """
    Sinh giọng đọc fallback sử dụng Microsoft Edge TTS.
    Giọng đọc chất lượng cao giống ElevenLabs, không giới hạn quota và không bị chặn IP trên Vercel.
    """
    try:
        import edge_tts
        # Rookie: Giọng Mỹ nữ trẻ trung năng động (en-US-AnaNeural)
        # Cynic: Giọng Anh nam trầm ấm mỉa mai (en-GB-RyanNeural)
        voice = "en-US-AnaNeural" if speaker.lower().strip() == "rookie" else "en-GB-RyanNeural"
        
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(file_path)
        
        # Xác thực file vừa lưu xem có hợp lệ không
        if is_valid_mp3(file_path):
            print(f"✓ [Edge TTS Fallback Success] Đã sinh và lưu file cache bằng Edge TTS: {filename}")
            return True
        else:
            print(f"⚠️ [Edge TTS Fallback Warning] Tệp Edge TTS sinh ra bị hỏng.")
            if os.path.exists(file_path):
                try: os.remove(file_path)
                except: pass
    except Exception as e:
        print(f"⚠️ [Edge TTS Fallback Error] Lỗi Edge TTS: {e}")
        if os.path.exists(file_path):
            try: os.remove(file_path)
            except: pass
    return False

async def generate_audio_file_async(text: str, speaker: str, voice_id: str = None, client: httpx.AsyncClient = None) -> str:
    """
    Tạo hoặc tải file audio đã được cache cho câu thoại (Async version).
    Trả về tên file audio (ví dụ 'abcd1234efgh.mp3') nằm trong cache.
    Nếu không cấu hình ELEVENLABS_API_KEY hoặc gọi API lỗi, tự động fallback sang gTTS.
    """
    if not voice_id:
        voice_id = get_voice_id(speaker)
        
    hash_input = f"{voice_id}:{text}".encode('utf-8')
    md5_hash = hashlib.md5(hash_input).hexdigest()
    filename = f"{md5_hash}.mp3"
    
    cache_dir = get_cache_dir()
    file_path = os.path.join(cache_dir, filename)
    
    # 1. Nếu file đã tồn tại và hoàn toàn hợp lệ (không bị hỏng), trả về tên file luôn
    if is_valid_mp3(file_path):
        try:
            os.utime(file_path, None)  # Cập nhật access time cho LRU
        except OSError:
            pass
        print(f"[TTS Cache Hit] Sử dụng file cache đã có: {filename}")
        return filename
        
    # Bọc ghi file trong lock để đảm bảo thread-safe/async-safe
    async with _audio_write_lock:
        # Kiểm tra lại lần nữa sau khi lấy được lock (double-checked locking)
        if is_valid_mp3(file_path):
            return filename
        elif os.path.exists(file_path):
            try: os.remove(file_path)
            except: pass

        # Circuit Breaker: Kiểm tra xem ElevenLabs đã bị vô hiệu hóa trước đó do lỗi Quota/Auth chưa.
        # Nếu đã bị vô hiệu hóa, chuyển ngay sang Edge TTS fallback để tránh Vercel timeout.
        global ELEVENLABS_DISABLED
        if ELEVENLABS_DISABLED:
            print("[TTS Info] ElevenLabs đang bị tạm khóa (Circuit Breaker). Chuyển thẳng sang Edge TTS fallback...")
            edge_success = await _generate_edge_tts_fallback(text, speaker, filename, file_path)
            if edge_success:
                return filename
            print("⚠️ [TTS Warning] Edge TTS thất bại trong Circuit Breaker. Chuyển sang gTTS fallback...")
            return await _generate_gtts_fallback_internal(text, speaker, filename, file_path)


        api_key = os.getenv("ELEVENLABS_API_KEY")
        if not api_key:
            print("[TTS Warning] Không tìm thấy ELEVENLABS_API_KEY trong .env. Sử dụng gTTS fallback...")
            return await _generate_gtts_fallback_internal(text, speaker, filename, file_path)

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json"
        }
        data = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75
            }
        }
        
        # Dọn dẹp cache trước khi tải mới để đảm bảo đủ dung lượng
        clean_old_cache(cache_dir)
        
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                print(f"[TTS API Call Async] Đang sinh giọng nói cho {speaker} bằng ElevenLabs (Lần thử {attempt}/{max_retries})...")
                
                if client is None:
                    async with httpx.AsyncClient() as temp_client:
                        response = await temp_client.post(url, json=data, headers=headers, timeout=15.0)
                else:
                    response = await client.post(url, json=data, headers=headers, timeout=15.0)
                    
                if response.status_code == 200:
                    with open(file_path, "wb") as f:
                        f.write(response.content)
                    print(f"✓ [TTS Success] Đã sinh và lưu file cache từ ElevenLabs: {filename}")
                    return filename
                elif response.status_code == 429:
                    wait_time = attempt * 1.5
                    print(f"⚠️ [TTS API Rate Limit] ElevenLabs 429. Chờ {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"✗ [TTS API Error] ElevenLabs API trả về mã lỗi {response.status_code}")
                    # Nếu gặp lỗi Quota/Auth (400, 401, 403), ngắt mạch (Circuit Breaker) ngay lập tức
                    # để các lượt gọi song song hoặc tuần sau tiếp theo chuyển thẳng sang gTTS mà không phí thời gian gọi API.
                    if response.status_code in [400, 401, 403]:
                        print(f"⚠️ [TTS Warning] Phát hiện lỗi Quota/Auth ({response.status_code}) từ ElevenLabs. Kích hoạt Circuit Breaker.")
                        ELEVENLABS_DISABLED = True
                        break
                    if attempt == max_retries:
                        break
            except Exception as exc:
                print(f"⚠️ [TTS API Exception] Lỗi ElevenLabs lần thử {attempt}: {exc}")
                if attempt == max_retries:
                    # Gặp lỗi kết nối liên tiếp cũng có thể ngắt mạch để tránh block Vercel Serverless Function
                    print("⚠️ [TTS Warning] Thất bại kết nối liên tiếp tới ElevenLabs. Kích hoạt Circuit Breaker.")
                    ELEVENLABS_DISABLED = True
                    break
                await asyncio.sleep(attempt * 0.5)
        
        # Fallback cuối cùng nếu lỗi ElevenLabs qua hết các lần thử
        print(f"⚠️ [TTS Warning] Không sinh được giọng từ ElevenLabs sau {max_retries} lần thử. Đang chuyển sang Edge TTS fallback...")
        
        # 1. Thử Microsoft Edge TTS (ổn định, không giới hạn quota, giọng đọc cực hay và không bị chặn IP)
        edge_success = await _generate_edge_tts_fallback(text, speaker, filename, file_path)
        if edge_success:
            return filename
            
        # 2. Thử gTTS làm biện pháp cứu cánh cuối cùng
        print("⚠️ [TTS Warning] Edge TTS thất bại. Chuyển sang gTTS fallback...")
        return await _generate_gtts_fallback_internal(text, speaker, filename, file_path)


def generate_audio_file(text: str, speaker: str, voice_id: str = None) -> str:
    """
    Bản đồng bộ bọc lại hàm async (Tương thích ngược).
    """
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    if loop.is_running():
        import nest_asyncio
        nest_asyncio.apply()
        return loop.run_until_complete(generate_audio_file_async(text, speaker, voice_id))
    else:
        return loop.run_until_complete(generate_audio_file_async(text, speaker, voice_id))

async def download_assets_if_missing():
    """
    Tải các file asset nhạc nền và tiếng cười nếu chưa tồn tại.
    """
    assets_dir = get_assets_dir()
    
    bg_music_path = os.path.join(assets_dir, "bg_music.mp3")
    laugh_sfx_path = os.path.join(assets_dir, "laugh.mp3")
    
    async with httpx.AsyncClient() as client:
        # Tải nhạc nền nếu thiếu hoặc bị rỗng
        if not os.path.exists(bg_music_path) or os.path.getsize(bg_music_path) == 0:
            try:
                print(f"[Assets] Downloading background music from {BG_MUSIC_URL}...")
                response = await client.get(BG_MUSIC_URL, timeout=30.0)
                if response.status_code == 200:
                    with open(bg_music_path, "wb") as f:
                        f.write(response.content)
                    print("✓ [Assets] Background music downloaded successfully.")
                else:
                    print(f"✗ [Assets] Failed to download background music: {response.status_code}")
            except Exception as e:
                print(f"✗ [Assets] Exception downloading background music: {e}")
                
        # Tải tiếng cười sfx nếu thiếu hoặc bị rỗng
        if not os.path.exists(laugh_sfx_path) or os.path.getsize(laugh_sfx_path) == 0:
            try:
                print(f"[Assets] Downloading laughter SFX from {LAUGH_SFX_URL}...")
                response = await client.get(LAUGH_SFX_URL, timeout=15.0)
                if response.status_code == 200:
                    with open(laugh_sfx_path, "wb") as f:
                        f.write(response.content)
                    print("✓ [Assets] Laughter SFX downloaded successfully.")
                else:
                    print(f"✗ [Assets] Failed to download laughter SFX: {response.status_code}")
            except Exception as e:
                print(f"✗ [Assets] Exception downloading laughter SFX: {e}")

async def merge_scenes_to_podcast(
    scenes: list, 
    podcast_id: str, 
    enable_bgm: bool = True, 
    enable_sfx: bool = True,
    rookie_voice: str = None,
    cynic_voice: str = None
) -> str:
    """
    Ghép nối các câu thoại của scenes thành một file podcast mp3 duy nhất,
    lồng nhạc nền và tiếng cười hiệu ứng, sau đó lưu cache.
    Trả về tên file podcast (ví dụ: 'podcast_{id}_{config_hash}.mp3').
    """
    cache_dir = get_cache_dir()
    
    # Tính hash cấu hình để đưa vào tên file cache
    config_str = f"{enable_bgm}:{enable_sfx}:{rookie_voice}:{cynic_voice}"
    config_hash = hashlib.md5(config_str.encode('utf-8')).hexdigest()[:8]
    
    podcast_filename = f"podcast_{podcast_id}_{config_hash}.mp3"
    podcast_path = os.path.join(cache_dir, podcast_filename)
    
    # Nếu đã có file trong cache và không bị trống (0 bytes), trả về ngay
    if os.path.exists(podcast_path):
        if os.path.getsize(podcast_path) > 0:
            print(f"[Podcast Cache Hit] Using existing podcast file: {podcast_filename}")
            return podcast_filename
        else:
            try:
                os.remove(podcast_path)
                print(f"[Podcast Cleanup] Deleted empty cached podcast file: {podcast_filename}")
            except Exception:
                pass
        
    print(f"[Podcast Gen] Starting merge for podcast: {podcast_id}")
    wait_for_ffmpeg()
    
    # 1. Thu thập các AudioSegment câu thoại
    segments = []
    assets_dir = get_assets_dir()
    bg_music_path = os.path.join(assets_dir, "bg_music.mp3")
    laugh_sfx_path = os.path.join(assets_dir, "laugh.mp3")
    
    # Đọc tiếng cười nếu có và dung lượng hợp lệ
    laugh_sfx = None
    if enable_sfx and os.path.exists(laugh_sfx_path) and os.path.getsize(laugh_sfx_path) > 0:
        try:
            laugh_sfx = AudioSegment.from_mp3(laugh_sfx_path) - 12  # Giảm âm lượng tiếng cười một chút
        except Exception as e:
            print(f"[Podcast Gen] Lỗi đọc sfx tiếng cười: {e}")
            
    # Tải song song tất cả các tệp thiếu trước khi đọc
    missing_tasks = []
    for scene in scenes:
        speaker = scene.get("speaker", "cynic")
        text = scene.get("text", "")
        voice_id = scene.get("voice_id")
        if not voice_id:
            voice_id = rookie_voice if speaker == "rookie" else cynic_voice
        if not voice_id:
            voice_id = get_voice_id(speaker)
            
        hash_input = f"{voice_id}:{text}".encode('utf-8')
        md5_hash = hashlib.md5(hash_input).hexdigest()
        scene_file = os.path.join(cache_dir, f"{md5_hash}.mp3")
        
        if not is_valid_mp3(scene_file):
            if os.path.exists(scene_file):
                try: os.remove(scene_file)
                except: pass
            print(f"[Podcast Gen] Thiếu hoặc hỏng file audio cho: {text[:20]}... Đang thêm vào hàng đợi sinh...")
            missing_tasks.append(generate_audio_file_async(text, speaker, voice_id))
            
    if missing_tasks:
        print(f"[Podcast Gen] Bắt đầu sinh song song {len(missing_tasks)} tệp âm thanh thiếu...")
        await asyncio.gather(*missing_tasks)
        
    for idx, scene in enumerate(scenes):
        speaker = scene.get("speaker", "cynic")
        text = scene.get("text", "")
        voice_id = scene.get("voice_id")
        if not voice_id:
            voice_id = rookie_voice if speaker == "rookie" else cynic_voice
        if not voice_id:
            voice_id = get_voice_id(speaker)
            
        hash_input = f"{voice_id}:{text}".encode('utf-8')
        md5_hash = hashlib.md5(hash_input).hexdigest()
        scene_file = os.path.join(cache_dir, f"{md5_hash}.mp3")
        
        if is_valid_mp3(scene_file):
            try:
                seg = AudioSegment.from_mp3(scene_file)
                segments.append((speaker, seg))
            except Exception as e:
                print(f"[Podcast Gen] Lỗi đọc segment {md5_hash} (mặc dù đã pass validation): {e}")
                segments.append((speaker, AudioSegment.silent(duration=2000)))
        else:
            print(f"[Podcast Gen Warning] Thất bại khi sinh file audio. Sử dụng silent segment.")
            segments.append((speaker, AudioSegment.silent(duration=2000)))
            
    if not segments:
        print("[Podcast Gen Error] Không có audio segment nào để ghép nối.")
        return ""
        
    # 2. Ghép nối các segment
    combined = AudioSegment.silent(duration=500)  # Bắt đầu bằng 500ms im lặng
    
    for idx, (speaker, seg) in enumerate(segments):
        combined += seg
        
        # Thêm tiếng cười hiệu ứng ngẫu nhiên hoặc sau câu của cynic (ở giữa kịch bản)
        if speaker == "cynic" and laugh_sfx and idx < len(segments) - 1:
            if idx % 2 == 1:
                # Chèn khoảng lặng ngắn rồi cho tiếng cười
                combined += AudioSegment.silent(duration=300)
                # Lấy 1.5s đầu tiên của tiếng cười để tránh tiếng cười quá dài
                laugh_segment = laugh_sfx[:1500]
                combined += laugh_segment
                combined += AudioSegment.silent(duration=400)
                continue
                
        # Khoảng lặng thông thường giữa các câu thoại
        combined += AudioSegment.silent(duration=800)
        
    # 3. Lồng nhạc nền (background music)
    if enable_bgm and os.path.exists(bg_music_path) and os.path.getsize(bg_music_path) > 0:
        try:
            bg_music = AudioSegment.from_mp3(bg_music_path)
            if len(bg_music) > 0:
                # Giảm âm lượng nhạc nền cho rất nhỏ (ví dụ -24dB)
                bg_music = bg_music - 24
                
                # Cắt hoặc lặp nhạc nền cho khớp với độ dài podcast
                podcast_duration = len(combined)
                if len(bg_music) < podcast_duration:
                    # Lặp lại nhạc nền nếu ngắn hơn
                    loops = (podcast_duration // len(bg_music)) + 1
                    bg_music = bg_music * loops
                bg_music = bg_music[:podcast_duration]
                
                # Fade out nhạc nền ở 1.5 giây cuối cùng
                bg_music = bg_music.fade_out(1500)
                
                # Overlay nhạc nền vào cuộc đối thoại
                combined = combined.overlay(bg_music)
                print("✓ [Podcast Gen] Đã lồng nhạc nền thành công.")
            else:
                print("[Podcast Gen Warning] Nhạc nền trống (length=0).")
        except Exception as e:
            print(f"[Podcast Gen Warning] Không lồng được nhạc nền: {e}")
            
    # 4. Xuất file
    try:
        # Sử dụng thread pool để việc ghi đĩa không block async loop
        await asyncio.to_thread(combined.export, podcast_path, format="mp3", bitrate="128k")
        print(f"✓ [Podcast Success] Đã tạo thành công podcast: {podcast_filename}")
        return podcast_filename
    except Exception as e:
        print(f"✗ [Podcast Export Error] Lỗi ghi file podcast: {e}")
        if os.path.exists(podcast_path):
            try:
                os.remove(podcast_path)
            except Exception:
                pass
        return ""

def get_podcast_timings(
    scenes: list, 
    enable_bgm: bool = True, 
    enable_sfx: bool = True,
    rookie_voice: str = None,
    cynic_voice: str = None
) -> list[dict]:
    """
    Tính toán chính xác mốc thời gian (bắt đầu, kết thúc, thời lượng) của từng scene trong podcast đã ghép.
    """
    cache_dir = get_cache_dir()
    wait_for_ffmpeg()
    timings = []
    current_time_ms = 500  # Bắt đầu bằng 500ms im lặng
    
    # Đọc sfx tiếng cười
    assets_dir = get_assets_dir()
    laugh_sfx_path = os.path.join(assets_dir, "laugh.mp3")
    laugh_sfx_exists = enable_sfx and os.path.exists(laugh_sfx_path) and os.path.getsize(laugh_sfx_path) > 0
    
    for idx, scene in enumerate(scenes):
        speaker = scene.get("speaker", "cynic")
        text = scene.get("text", "")
        voice_id = scene.get("voice_id")
        if not voice_id:
            voice_id = rookie_voice if speaker == "rookie" else cynic_voice
        if not voice_id:
            voice_id = get_voice_id(speaker)
            
        hash_input = f"{voice_id}:{text}".encode('utf-8')
        md5_hash = hashlib.md5(hash_input).hexdigest()
        scene_file = os.path.join(cache_dir, f"{md5_hash}.mp3")
        
        duration_ms = 3000  # Fallback
        if is_valid_mp3(scene_file):
            try:
                seg = AudioSegment.from_mp3(scene_file)
                duration_ms = len(seg)
            except Exception:
                duration_ms = 3000
        else:
            # Ước lượng độ dài chuẩn xác dựa trên số lượng từ (khớp 100% với frontend)
            # Giúp cho Container B (stateless metadata) trả về timing chính xác ngay cả khi không có file cache.
            word_count = len(text.split())
            duration_ms = int(max(3200, word_count * 380))
                
        start_sec = current_time_ms / 1000.0
        end_sec = (current_time_ms + duration_ms) / 1000.0
        timings.append({
            "start": start_sec,
            "end": end_sec,
            "duration": duration_ms / 1000.0
        })
        
        current_time_ms += duration_ms
        
        # Tiếng cười hiệu ứng ngẫu nhiên hoặc sau câu của cynic (ở giữa kịch bản)
        if speaker == "cynic" and laugh_sfx_exists and idx < len(scenes) - 1:
            if idx % 2 == 1:
                current_time_ms += 300 + 1500 + 400
                continue
                
        # Khoảng lặng thông thường giữa các câu thoại
        current_time_ms += 800
        
    return timings
