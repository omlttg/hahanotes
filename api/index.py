import os
import hashlib
import sqlite3
import time
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import httpx

# Import helper functions
try:
    from api.agent_helper import generate_script_with_agent, chat_with_agent
    from api.audio_generator import generate_audio_file_async, get_voice_id, get_cache_dir, get_podcast_timings
except ImportError:
    from agent_helper import generate_script_with_agent, chat_with_agent
    from audio_generator import generate_audio_file_async, get_voice_id, get_cache_dir, get_podcast_timings

# Load environment variables (.env file)
load_dotenv()

def parse_chat_reply(reply: str) -> list[dict]:
    """
    Phân tích chuỗi phản hồi chat chứa [rookie] và [cynic] thành danh sách các câu thoại có sender và text.
    """
    lines = reply.split('\n')
    parsed = []
    for line in lines:
        trimmed = line.strip()
        if trimmed.startswith('[rookie]:'):
            parsed.append({"sender": "rookie", "text": trimmed.replace('[rookie]:', '').strip()})
        elif trimmed.startswith('[cynic]:'):
            parsed.append({"sender": "cynic", "text": trimmed.replace('[cynic]:', '').strip()})
        elif trimmed:
            # Fallback nhãn
            last_sender = parsed[-1]["sender"] if parsed else "cynic"
            parsed.append({"sender": last_sender, "text": trimmed})
            
    if not parsed and reply.strip():
        parsed.append({"sender": "cynic", "text": reply.strip()})
        
    return parsed

# Đường dẫn DB SQLite trong thư mục tạm /tmp để chạy an toàn trên Vercel Stateless Serverless
DB_PATH = "/tmp/hahanotes_metadata.db"

def init_db():
    """
    Khởi tạo cấu trúc bảng SQLite để lưu trữ mapping và cached scripts.
    Giúp chống lạm dụng ElevenLabs API và tiết kiệm Quota Gemini.
    """
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audio_mapping (
                md5_hash TEXT PRIMARY KEY,
                text TEXT,
                speaker TEXT,
                voice_id TEXT,
                created_at REAL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS prompt_cache (
                prompt_hash TEXT PRIMARY KEY,
                title TEXT,
                scenes TEXT,
                conversation_id TEXT,
                created_at REAL
            )
        """)
        conn.commit()
    print("✓ [DB] Khởi tạo Database SQLite thành công tại:", DB_PATH)

def save_audio_mapping(md5_hash: str, text: str, speaker: str, voice_id: str):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO audio_mapping VALUES (?, ?, ?, ?, ?)",
                (md5_hash, text, speaker, voice_id, time.time())
            )
            conn.commit()
    except Exception as e:
        print(f"! [DB Error] Không thể lưu mapping: {e}")

def get_audio_mapping(md5_hash: str) -> tuple:
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT text, speaker, voice_id FROM audio_mapping WHERE md5_hash = ?", 
                (md5_hash,)
            )
            return cursor.fetchone()
    except Exception as e:
        print(f"! [DB Error] Lỗi đọc mapping: {e}")
        return None

def get_cached_script(prompt_hash: str) -> dict:
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT title, scenes, conversation_id FROM prompt_cache WHERE prompt_hash = ?", 
                (prompt_hash,)
            )
            row = cursor.fetchone()
            if row:
                print(f"✓ [Cache Hit] Sử dụng kịch bản cache cho prompt hash: {prompt_hash}")
                return {
                    "title": row[0],
                    "scenes": json.loads(row[1]),
                    "conversation_id": row[2]
                }
    except Exception as e:
        print(f"! [DB Error] Lỗi đọc prompt cache: {e}")
    return None

def cache_script(prompt_hash: str, title: str, scenes: list, conversation_id: str):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO prompt_cache VALUES (?, ?, ?, ?, ?)",
                (prompt_hash, title, json.dumps(scenes), conversation_id, time.time())
            )
            conn.commit()
            print(f"✓ [Cache Save] Lưu kịch bản thành công cho prompt: {prompt_hash}")
    except Exception as e:
        print(f"! [DB Error] Không thể cache kịch bản: {e}")

def get_scenes_by_conversation_id(conversation_id: str) -> dict:
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT title, scenes FROM prompt_cache WHERE conversation_id = ?", 
                (conversation_id,)
            )
            row = cursor.fetchone()
            if row:
                return {
                    "title": row[0],
                    "scenes": json.loads(row[1])
                }
    except Exception as e:
        print(f"! [DB Error] Lỗi đọc scenes bằng conversation_id: {e}")
    return None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi tạo httpx.AsyncClient dùng chung cho toàn bộ app lifespan
    app.state.http_client = httpx.AsyncClient()
    try:
        init_db()
        # Tải assets nhạc nền và tiếng cười bất đồng bộ
        import asyncio
        try:
            from api.audio_generator import download_assets_if_missing
        except ImportError:
            from audio_generator import download_assets_if_missing
        asyncio.create_task(download_assets_if_missing())
    except Exception as e:
        print(f"! [DB Error] Lỗi khởi tạo SQLite hoặc tải assets: {e}")
    yield
    # Giải phóng http client
    await app.state.http_client.aclose()

app = FastAPI(title="HahaNotes AI Backend", version="0.2.0", lifespan=lifespan)

# Cấu hình CORS bảo mật và tương thích với Preview Deploys của Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000", 
        "http://localhost:8081",
        "https://hahanotes.vercel.app"  # Domain production đề xuất
    ],
    allow_origin_regex="https://.*\.vercel\.app",  # Cho phép tất cả các preview/branch deploy
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Khai báo cấu trúc dữ liệu đầu vào cho các request
class GenerateRequest(BaseModel):
    input: str
    category: str
    topic: str
    rookieVoice: str = None
    cynicVoice: str = None
    scenesCount: int = 5
    enableBgm: bool = True
    enableSfx: bool = True

class ChatRequest(BaseModel):
    message: str
    conversation_id: str
    rookieVoice: str = None
    cynicVoice: str = None
    history: list[dict] = None  # Gửi kèm lịch sử chat từ Frontend để giữ ngữ cảnh fallback

@app.get("/api/health")
def health_check():
    """
    API Health check đơn giản, bảo mật, không lộ sự tồn tại của các key nhạy cảm.
    """
    return {
        "status": "ok",
        "message": "HahaNotes AI Backend is running smoothly!"
    }

@app.post("/api/generate-script")
async def api_generate_script(payload: GenerateRequest):
    """
    Tạo kịch bản đối thoại hài hước dạng JSON từ đầu vào thô của người dùng.
    Hỗ trợ cache kịch bản và phản hồi tức thời dưới 1.5s nhờ on-demand audio mapping.
    """
    # Phòng chống DoS
    if len(payload.input) > 500:
        raise HTTPException(
            status_code=400,
            detail="Nội dung nỗi lòng quá dài. Vui lòng nhập dưới 500 ký tự."
        )

    sa_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "service-account.json"))
    if not os.getenv("GEMINI_API_KEY") and not os.path.exists(sa_path):
        raise HTTPException(
            status_code=500,
            detail="Thông tin xác thực chưa được cấu hình. Vui lòng liên hệ Admin."
        )
        
    try:
        # Tính hash của prompt để kiểm tra trong Cache DB
        prompt_hash_input = f"{payload.input}:{payload.category}:{payload.topic}".encode('utf-8')
        prompt_hash = hashlib.md5(prompt_hash_input).hexdigest()
        
        cached = get_cached_script(prompt_hash)
        if cached:
            scenes = cached["scenes"]
            conversation_id = cached["conversation_id"]
            title = cached["title"]
        else:
            structured_data, conversation_id = await generate_script_with_agent(
                user_input=payload.input,
                category=payload.category,
                topic=payload.topic,
                scenes_count=payload.scenesCount
            )
            title = structured_data.get("title", "HahaNote không tên")
            scenes = structured_data.get("scenes", [])
            # Lưu kịch bản vào Cache DB
            cache_script(prompt_hash, title, scenes, conversation_id)
            
        # Ánh xạ link audio stream on-demand và lưu metadata vào SQLite
        for scene in scenes:
            speaker = scene.get("speaker", "cynic")
            text = scene.get("text", "")
            voice_id = payload.rookieVoice if speaker == "rookie" else payload.cynicVoice
            if not voice_id:
                voice_id = get_voice_id(speaker)
                
            # Tính MD5 cho từng câu thoại + voice_id
            hash_input = f"{voice_id}:{text}".encode('utf-8')
            md5_hash = hashlib.md5(hash_input).hexdigest()
            
            # Lưu mapping vào DB SQLite tạm trên Vercel để ngăn chặn lạm dụng API ElevenLabs
            save_audio_mapping(md5_hash, text, speaker, voice_id)
            
            # Trả về đường dẫn on-demand stream chỉ với MD5 (bảo mật, không lộ text qua query dài)
            scene["audioUrl"] = f"/api/audio-stream/{md5_hash}"
            
        return {
            "success": True,
            "title": title,
            "scenes": scenes,
            "conversation_id": conversation_id,
            "audioBase64": "",  # Tương thích ngược
            "alignment": []     # Tương thích ngược
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi sinh kịch bản từ Gemini: {str(e)}")

@app.post("/api/chat")
async def api_chat(payload: ChatRequest):
    """
    Tiếp tục trò chuyện có trạng thái với 2 Host AI, gửi kèm lịch sử tin nhắn.
    """
    if not payload.conversation_id:
        raise HTTPException(status_code=400, detail="Thiếu conversation_id để tiếp tục cuộc trò chuyện.")
        
    if len(payload.message) > 500:
        raise HTTPException(status_code=400, detail="Tin nhắn quá dài. Vui lòng nhập dưới 500 ký tự.")

    try:
        reply = await chat_with_agent(
            message=payload.message,
            conversation_id=payload.conversation_id,
            history=payload.history
        )
        
        # Phân tích phản hồi chat và tạo mapping on-demand stream
        chat_replies = parse_chat_reply(reply)
        for item in chat_replies:
            speaker = item.get("sender", "cynic")
            text = item.get("text", "")
            voice_id = payload.rookieVoice if speaker == "rookie" else payload.cynicVoice
            if not voice_id:
                voice_id = get_voice_id(speaker)
                
            hash_input = f"{voice_id}:{text}".encode('utf-8')
            md5_hash = hashlib.md5(hash_input).hexdigest()
            
            # Lưu mapping an toàn
            save_audio_mapping(md5_hash, text, speaker, voice_id)
            
            # Gán URL stream on-demand
            item["audioUrl"] = f"/api/audio-stream/{md5_hash}"
            
        return {
            "success": True,
            "reply": reply,
            "chat_replies": chat_replies
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi tương tác với Agent: {str(e)}")

@app.get("/api/audio-stream/{md5_hash}")
async def api_audio_stream(md5_hash: str, request: Request):
    """
    Endpoint tải hoặc sinh audio on-demand. Bảo mật tuyệt đối: chỉ cho phép tải nếu md5_hash
    đã được định nghĩa trước bởi hệ thống trong DB mapping (ngăn chặn spam API ElevenLabs).
    """
    # 1. Tìm trong SQLite DB xem MD5 này có hợp lệ không
    mapping = get_audio_mapping(md5_hash)
    if not mapping:
        raise HTTPException(
            status_code=403, 
            detail="Truy cập bị từ chối. File audio chưa được đăng ký bởi hệ thống."
        )
        
    text, speaker, voice_id = mapping
    
    # 2. Kiểm tra file mp3 trong thư mục cache
    cache_dir = get_cache_dir()
    file_path = os.path.join(cache_dir, f"{md5_hash}.mp3")
    
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="audio/mpeg")
        
    # 3. Nếu chưa có file cache, sinh audio async sử dụng shared http client
    client = request.app.state.http_client
    filename = await generate_audio_file_async(text, speaker, voice_id, client=client)
    
    if filename and os.path.exists(file_path):
        # Stream file nhị phân tiết kiệm RAM
        return FileResponse(file_path, media_type="audio/mpeg")
        
    # Nếu ElevenLabs lỗi hoặc chưa cấu hình API Key, trả về 404
    raise HTTPException(status_code=404, detail="Audio file could not be generated.")

@app.get("/api/podcast/{conversation_id}.mp3")
async def api_get_podcast(
    conversation_id: str, 
    request: Request, 
    rookieVoice: str = None, 
    cynicVoice: str = None,
    enableBgm: bool = True,
    enableSfx: bool = True
):
    """
    Endpoint tải hoặc sinh file podcast mp3 hoàn chỉnh.
    Nó sẽ tự động kiểm tra xem các file âm thanh thành phần có đủ chưa.
    Nếu thiếu, nó sẽ sinh nốt và ghép nối thành một file podcast duy nhất.
    """
    # 1. Lấy kịch bản từ database
    data = get_scenes_by_conversation_id(conversation_id)
    if not data:
        raise HTTPException(status_code=404, detail="Conversation script not found.")
        
    scenes = data["scenes"]
    
    # 2. Đảm bảo tất cả các file âm thanh thành phần đã được sinh trong cache
    cache_dir = get_cache_dir()
    client = request.app.state.http_client
    
    for scene in scenes:
        speaker = scene.get("speaker", "cynic")
        text = scene.get("text", "")
        voice_id = rookieVoice if speaker == "rookie" else cynicVoice
        if not voice_id:
            voice_id = get_voice_id(speaker)
            
        scene["voice_id"] = voice_id
        
        hash_input = f"{voice_id}:{text}".encode('utf-8')
        md5_hash = hashlib.md5(hash_input).hexdigest()
        file_path = os.path.join(cache_dir, f"{md5_hash}.mp3")
        
        # Lưu mapping nếu chưa có để stream on-demand hoạt động
        save_audio_mapping(md5_hash, text, speaker, voice_id)
        
        if not os.path.exists(file_path):
            print(f"[Podcast Build] Sinh giọng đọc ElevenLabs thiếu cho: {text[:20]}...")
            await generate_audio_file_async(text, speaker, voice_id, client=client)
            
    # 3. Tiến hành ghép nối podcast
    try:
        from api.audio_generator import merge_scenes_to_podcast
    except ImportError:
        from audio_generator import merge_scenes_to_podcast
        
    podcast_filename = await merge_scenes_to_podcast(
        scenes, 
        conversation_id, 
        enable_bgm=enableBgm, 
        enable_sfx=enableSfx,
        rookie_voice=rookieVoice,
        cynic_voice=cynicVoice
    )
    podcast_path = os.path.join(cache_dir, podcast_filename)
    
    if podcast_filename and os.path.exists(podcast_path):
        return FileResponse(podcast_path, media_type="audio/mpeg", filename=f"podcast_{conversation_id}.mp3")
        
    raise HTTPException(status_code=500, detail="Failed to merge scenes into podcast.")

@app.get("/api/podcast/{conversation_id}/metadata")
async def api_get_podcast_metadata(
    conversation_id: str,
    request: Request,
    rookieVoice: str = None,
    cynicVoice: str = None,
    enableBgm: bool = True,
    enableSfx: bool = True
):
    """
    Endpoint trả về thông tin chính xác về thời điểm bắt đầu/kết thúc/thời lượng của từng scene trong podcast đã ghép.
    """
    data = get_scenes_by_conversation_id(conversation_id)
    if not data:
        raise HTTPException(status_code=404, detail="Conversation script not found.")
        
    scenes = data["scenes"]
    
    # Gán các voice_id vào scenes để khớp với podcast đã sinh
    for scene in scenes:
        speaker = scene.get("speaker", "cynic")
        voice_id = rookieVoice if speaker == "rookie" else cynicVoice
        if not voice_id:
            voice_id = get_voice_id(speaker)
        scene["voice_id"] = voice_id
        
    timings = get_podcast_timings(
        scenes,
        enable_bgm=enableBgm,
        enable_sfx=enableSfx,
        rookie_voice=rookieVoice,
        cynic_voice=cynicVoice
    )
    
    return {
        "success": True,
        "timings": timings
    }

# Chạy server khi execute file trực tiếp
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("index:app", host="127.0.0.1", port=8081, reload=True)
