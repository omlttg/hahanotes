import os
import hashlib
import httpx
from pydub import AudioSegment

# Default voice IDs from ElevenLabs
DEFAULT_ROOKIE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Bella (trẻ trung)
DEFAULT_CYNIC_VOICE_ID = "ErXwobaYiN019PkySvjV"   # Antoni (nam trầm ấm, mỉa mai, hoạt động 100%)

# URLs cho assets nhạc nền và hiệu ứng
BG_MUSIC_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3"  # Nhạc nền nhẹ nhàng
LAUGH_SFX_URL = "https://www.soundjay.com/human/sounds/laughter-3.mp3"          # Tiếng cười hiệu ứng

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
    Đảm bảo ffmpeg khả dụng trên Vercel bằng cách tự động tải static binary
    từ một nguồn uy tín vào /tmp/bin và đưa nó vào PATH của hệ thống.
    """
    import os
    import urllib.request
    import shutil
    import stat
    
    # 1. Kiểm tra xem ffmpeg đã có trên hệ thống chưa
    if shutil.which("ffmpeg"):
        print("✓ [FFmpeg] Đã tìm thấy ffmpeg trên hệ thống.")
        return True
        
    bin_dir = "/tmp/bin"
    ffmpeg_path = os.path.join(bin_dir, "ffmpeg")
    ffmpeg_tmp = os.path.join(bin_dir, "ffmpeg.tmp")
    
    # Thêm bin_dir vào PATH để pydub có thể tự tìm thấy
    if bin_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
        
    if os.path.exists(ffmpeg_path):
        print("✓ [FFmpeg] Đã có sẵn static ffmpeg trong /tmp/bin.")
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
    import os
    import shutil
    import time
    
    if shutil.which("ffmpeg"):
        return True
        
    bin_dir = "/tmp/bin"
    ffmpeg_path = os.path.join(bin_dir, "ffmpeg")
    
    if bin_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
        
    if os.path.exists(ffmpeg_path):
        return True
        
    start_time = time.time()
    print("⏳ [FFmpeg] Đang chờ tải ffmpeg hoàn tất...")
    while time.time() - start_time < timeout_seconds:
        if os.path.exists(ffmpeg_path):
            if os.access(ffmpeg_path, os.X_OK):
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
                    stat = os.stat(path)
                    files.append((path, stat.st_atime, stat.st_size))
                    total_size += stat.st_size
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

async def generate_audio_file_async(text: str, speaker: str, voice_id: str = None, client: httpx.AsyncClient = None) -> str:
    """
    Tạo hoặc tải file audio đã được cache cho câu thoại (Async version).
    Trả về tên file audio (ví dụ 'abcd1234efgh.mp3') nằm trong cache.
    Nếu không cấu hình ELEVENLABS_API_KEY hoặc gọi API lỗi, trả về chuỗi rỗng.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("[TTS Warning] Không tìm thấy ELEVENLABS_API_KEY trong .env. Bỏ qua sinh giọng nói.")
        return ""

    if not voice_id:
        voice_id = get_voice_id(speaker)
        
    hash_input = f"{voice_id}:{text}".encode('utf-8')
    md5_hash = hashlib.md5(hash_input).hexdigest()
    filename = f"{md5_hash}.mp3"
    
    cache_dir = get_cache_dir()
    file_path = os.path.join(cache_dir, filename)
    
    # Nếu file đã tồn tại trong cache, cập nhật access time và trả về tên file luôn
    if os.path.exists(file_path):
        try:
            os.utime(file_path, None)  # Cập nhật access time cho LRU
        except OSError:
            pass
        print(f"[TTS Cache Hit] Sử dụng file cache đã có: {filename}")
        return filename
        
    # Gọi ElevenLabs API sinh giọng nói mới
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
    
    try:
        print(f"[TTS API Call Async] Đang sinh giọng nói cho {speaker} bằng ElevenLabs...")
        
        # Sử dụng AsyncClient truyền vào hoặc khởi tạo tạm thời
        if client is None:
            async with httpx.AsyncClient() as temp_client:
                response = await temp_client.post(url, json=data, headers=headers, timeout=20.0)
        else:
            response = await client.post(url, json=data, headers=headers, timeout=20.0)
            
        if response.status_code == 200:
            with open(file_path, "wb") as f:
                f.write(response.content)
            print(f"✓ [TTS Success] Đã sinh và lưu file cache từ ElevenLabs: {filename}")
            return filename
        else:
            print(f"✗ [TTS API Error] ElevenLabs API trả về mã lỗi {response.status_code}: {response.text}")
            raise ValueError(f"ElevenLabs status {response.status_code}")
    except Exception as e:
        print(f"⚠️ [TTS Warning] Không sinh được giọng từ ElevenLabs ({str(e)}). Đang tự động chuyển sang gTTS làm fallback...")
        try:
            from gtts import gTTS
            # Rookie -> English American (lang='en', tld='com')
            # Cynic -> English British (lang='en', tld='co.uk')
            tld = "com" if speaker.lower().strip() == "rookie" else "co.uk"
            tts = gTTS(text=text, lang="en", tld=tld)
            
            # Lưu file audio bằng gTTS
            tts.save(file_path)
            print(f"✓ [TTS Fallback Success] Đã sinh và lưu file cache bằng gTTS: {filename}")
            return filename
        except Exception as fallback_err:
            print(f"✗ [TTS Fallback Error] Thất bại hoàn toàn khi sinh gTTS: {fallback_err}")
            return ""

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
        # Nếu đang chạy trong loop, ta dùng run_coroutine_threadsafe hoặc bọc chạy đồng bộ tạm thời
        # Để an toàn nhất cho FastAPI (vốn chạy async), trên server ta sẽ KHÔNG gọi hàm này
        # mà gọi trực tiếp generate_audio_file_async. Hàm này chủ yếu dùng cho test script.
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
        # Tải nhạc nền nếu thiếu
        if not os.path.exists(bg_music_path):
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
                
        # Tải tiếng cười sfx nếu thiếu
        if not os.path.exists(laugh_sfx_path):
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
    Trả về tên file podcast (ví dụ: 'podcast_{id}.mp3').
    """
    cache_dir = get_cache_dir()
    podcast_filename = f"podcast_{podcast_id}.mp3"
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
    
    # Đọc tiếng cười nếu có
    laugh_sfx = None
    if enable_sfx and os.path.exists(laugh_sfx_path):
        try:
            laugh_sfx = AudioSegment.from_mp3(laugh_sfx_path) - 12  # Giảm âm lượng tiếng cười một chút
        except Exception as e:
            print(f"[Podcast Gen] Lỗi đọc sfx tiếng cười: {e}")
            
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
        
        if os.path.exists(scene_file):
            try:
                seg = AudioSegment.from_mp3(scene_file)
                segments.append((speaker, seg))
            except Exception as e:
                print(f"[Podcast Gen] Lỗi đọc segment {md5_hash}: {e}")
                # Fallback: Tạo một đoạn silent ngắn để ko bị mất sub
                segments.append((speaker, AudioSegment.silent(duration=2000)))
        else:
            # Nếu chưa có file (lỗi ElevenLabs hoặc chạy local không key), tạo silent audio
            print(f"[Podcast Gen Warning] Thiếu file audio cho: {text[:20]}...")
            segments.append((speaker, AudioSegment.silent(duration=3000)))
            
    if not segments:
        print("[Podcast Gen Error] Không có audio segment nào để ghép nối.")
        return ""
        
    # 2. Ghép nối các segment
    combined = AudioSegment.silent(duration=500)  # Bắt đầu bằng 500ms im lặng
    
    for idx, (speaker, seg) in enumerate(segments):
        combined += seg
        
        # Thêm tiếng cười hiệu ứng ngẫu nhiên hoặc sau câu của cynic (ở giữa kịch bản)
        if speaker == "cynic" and laugh_sfx and idx < len(segments) - 1:
            # Chỉ chèn thỉnh thoảng (ví dụ: ở vị trí chẵn) để tránh lạm dụng tiếng cười
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
    if enable_bgm and os.path.exists(bg_music_path):
        try:
            bg_music = AudioSegment.from_mp3(bg_music_path)
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
        except Exception as e:
            print(f"[Podcast Gen Warning] Không lồng được nhạc nền: {e}")
            
    # 4. Xuất file
    try:
        combined.export(podcast_path, format="mp3", bitrate="128k")
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
    laugh_sfx_exists = enable_sfx and os.path.exists(laugh_sfx_path)
    
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
        if os.path.exists(scene_file):
            try:
                seg = AudioSegment.from_mp3(scene_file)
                duration_ms = len(seg)
            except Exception:
                duration_ms = 3000
                
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


