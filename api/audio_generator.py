import os
import hashlib
import httpx

# Default voice IDs from ElevenLabs
DEFAULT_ROOKIE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Bella (trẻ trung)
DEFAULT_CYNIC_VOICE_ID = "N2lVS1w75z9C374a9uYx"   # Adam (trầm ấm)

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
            print(f"✓ [TTS Success] Đã sinh và lưu file cache: {filename}")
            return filename
        else:
            print(f"✗ [TTS API Error] ElevenLabs API trả về mã lỗi {response.status_code}: {response.text}")
            return ""
    except Exception as e:
        print(f"✗ [TTS Exception] Lỗi kết nối ElevenLabs API: {str(e)}")
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
