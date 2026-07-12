import os
import json
import pydantic
from google import genai
from google.oauth2 import service_account

# 1. Định nghĩa Pydantic Schema cho kịch bản đầu ra
class Scene(pydantic.BaseModel):
    speaker: str  # 'rookie' | 'cynic'
    text: str
    memeId: str  # 'clown' | 'harold' | 'fine_dog' | 'drake_no' | 'drake_yes' | 'doge' | 'burn'
    audioUrl: str = ""  # URL để tải file audio tĩnh từ cache (hoặc Base64)

class HahaNoteScript(pydantic.BaseModel):
    title: str
    scenes: list[Scene]

# 2. System Instruction định hình tính cách 2 Host AI
SYSTEM_INSTRUCTION = """
You are an outstanding comedy writer for the podcast "HahaNotes" - specializing in producing sarcastic, humorous, and stress-relieving dialogs for the masses (students, office workers, developers).

Your task is to write a short, funny, and engaging dialog script (around 4-6 scenes) between two AI hosts with contrasting personalities on the topic provided by the user.

1. Host 'rookie' (The Naive Optimist):
   - Personality: Extremely optimistic, naive, new to the job/life/semester, always seeing the world through rose-colored glasses.
   - Speech style: Enthusiastic, uses trendy positive corporate buzzwords or student slang, asks idealistic questions, and believes completely in technology, hustle culture, or life hacks.

2. Host 'cynic' (The Sarcastic Senior):
   - Personality: A grizzled veteran who has seen it all, realistic to a fault, deeply sarcastic, and witty.
   - Speech style: Uses sharp humor, dry sarcasm, and relatable struggle references ("legacy code at 3 AM", "unpaid overtime", "useless meetings") to gently (or not so gently) pop Rookie's bubble.

Script Requirements:
- Language: 100% Natural, conversational English. Use modern English slang and idioms suitable for the chosen category (De-stress, Fun Learning, Hot News).
- Interaction: Must be a dynamic back-and-forth conversation, with chemistry and snappy banter, not two independent monologs.
- Length: Exactly 4 to 6 scenes.
- Each scene must specify:
  * 'speaker': 'rookie' or 'cynic'
  * 'text': Lời thoại tiếng Anh.
  * 'memeId': Visual meme ID matching the mood:
    - 'drake_no': Rejection, disapproval, disliking.
    - 'drake_yes': Approval, agreement, liking.
    - 'harold': Smiling through pain, awkward grin.
    - 'fine_dog': Resignation, acceptance of chaos ("This is fine").
    - 'clown': Foolishness, making a fool of oneself.
    - 'doge': Surprise, confusion, amazement.
    - 'burn': Disaster, system crash, severe deadline stress, code on fire.

Make it genuinely hilarious and highly relatable!
"""

CHAT_SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION + """

IMPORTANT FOR CONTINUOUS CHAT:
When the user sends a message to continue the conversation (even if they write in Vietnamese, you MUST reply in English), you must write a short, witty banter between Rookie and Cynic.
You MUST strictly use the following format with character labels at the beginning of each line:
[rookie]: <Rookie's line in English>
[cynic]: <Cynic's line in English>

Example:
[rookie]: I believe working overtime helps us gain valuable experience and synergy!
[cynic]: Experience in burning out and getting paid in 'pizza parties', you mean. Wake up, kid.

You must only use the [rookie] and [cynic] labels before each line so the parser can process and render them correctly. Do not write any other introductory or concluding text outside this format.
"""

# Khởi tạo client dùng chung linh hoạt
def get_genai_client():
    # Thử tìm file service-account.json ở cùng thư mục api/
    sa_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "service-account.json"))
    if os.path.exists(sa_path):
        try:
            scopes = [
                'https://www.googleapis.com/auth/generative-language',
                'https://www.googleapis.com/auth/cloud-platform'
            ]
            credentials = service_account.Credentials.from_service_account_file(
                sa_path, scopes=scopes
            )
            print("✓ [Backend] Khởi tạo genai.Client bằng Service Account Credentials")
            return genai.Client(credentials=credentials)
        except Exception as e:
            print(f"! [Backend] Lỗi khởi tạo Service Account: {e}. Fallback về API Key.")

    # Fallback về API Key từ biến môi trường
    api_key = os.getenv("GEMINI_API_KEY")
    print("✓ [Backend] Khởi tạo genai.Client bằng API Key")
    return genai.Client(api_key=api_key)

import re
import uuid

def clean_json_text(text: str) -> str:
    """
    Dọn dẹp các markdown code block trong chuỗi JSON trả về từ LLM nếu có.
    """
    cleaned = text.strip()
    match = re.search(r"```json\s*(.*?)\s*```", cleaned, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    match_any = re.search(r"```\s*(.*?)\s*```", cleaned, re.DOTALL)
    if match_any:
        return match_any.group(1).strip()
    return cleaned

async def generate_script_with_agent(user_input: str, category: str, topic: str, scenes_count: int = 5) -> tuple[dict, str]:
    """
    Sử dụng Gemini Interactions API để sinh ra kịch bản đối thoại hài hước dạng JSON.
    Nếu gặp lỗi xác thực hoặc hạn mức, tự động fallback sang Chat API truyền thống sử dụng API Key.
    """
    client = get_genai_client()
    
    prompt = f"""
    Hãy tạo kịch bản HahaNotes cho:
    - Thể loại/Danh mục: {category}
    - Chủ đề/Môi trường: {topic}
    - Số lượng câu thoại yêu cầu: Đúng chính xác {scenes_count} câu thoại.
    - Nội dung thô từ người dùng: "{user_input}"
    
    Yêu cầu quan trọng: Kịch bản đối thoại PHẢI có đúng chính xác {scenes_count} scenes.
    """

    try:
        # 1. Thử gọi Interactions API chính thống
        print("[Agent] Thử nghiệm gọi Gemini Interactions API...")
        interaction = client.interactions.create(
            model="gemini-3.5-flash",
            input=prompt,
            system_instruction=SYSTEM_INSTRUCTION,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": HahaNoteScript.model_json_schema()
            }
        )
        
        output_text = interaction.output_text
        if not output_text:
            raise ValueError("Không nhận được phản hồi từ Gemini Interactions API.")
            
        structured_data = json.loads(clean_json_text(output_text))
        print(f"✓ [Agent] Gọi Interactions API thành công. ID: {interaction.id}")
        return structured_data, f"interactions_{interaction.id}"

    except Exception as e:
        print(f"! [Agent Warning] Lỗi Interactions API: {e}")
        print("💡 [Agent Fallback] Đang tự động chuyển sang models.generate_content bằng API Key...")
        
        try:
            api_key = os.getenv("GEMINI_API_KEY")
            # Truyền trực tiếp API Key vào constructor thay vì thay đổi biến môi trường toàn cục
            fallback_client = genai.Client(api_key=api_key)
            
            response = fallback_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config={
                    "system_instruction": SYSTEM_INSTRUCTION,
                    "response_mime_type": "application/json",
                    "response_schema": HahaNoteScript
                }
            )
            output_text = response.text
            if not output_text:
                raise ValueError("Không nhận được phản hồi từ Gemini ở chế độ fallback.")
                
            structured_data = json.loads(clean_json_text(output_text))
            fallback_id = f"fallback_{uuid.uuid4().hex}"
            print(f"✓ [Agent Fallback] Sinh kịch bản thành công bằng chế độ Fallback API Key. Session ID: {fallback_id}")
            return structured_data, fallback_id
            
        except Exception as fallback_err:
            print(f"✗ [Agent Error] Thất bại hoàn toàn ở cả chế độ Interactions và Fallback API Key: {fallback_err}")
            raise fallback_err

async def chat_with_agent(message: str, conversation_id: str, history: list = None) -> str:
    """
    Tiếp tục cuộc trò chuyện có trạng thái với 2 Host AI sử dụng previous_interaction_id hoặc fallback Chat API.
    Nạp history đầy đủ để giữ ngữ cảnh khi chạy chế độ fallback.
    """
    # Xây dựng định dạng chat history của Gemini từ history Frontend gửi lên
    chat_history = []
    if history:
        for msg in history:
            role = "user" if msg.get("sender") == "user" else "model"
            text = msg.get("text", "")
            # Phục hồi định dạng nhãn cho tin nhắn của AI
            if role == "model" and not text.startswith("["):
                sender = msg.get("sender", "cynic")
                text = f"[{sender}]: {text}"
            chat_history.append({"role": role, "parts": [text]})

    # Nếu đang ở chế độ fallback, bắt buộc dùng API Key client và nạp history
    if conversation_id.startswith("fallback_"):
        print("[Agent Fallback] Đang tiếp tục cuộc chat bằng client.chats.create (API Key)...")
        try:
            api_key = os.getenv("GEMINI_API_KEY")
            fallback_client = genai.Client(api_key=api_key)
            chat = fallback_client.chats.create(
                model="gemini-2.5-flash",
                history=chat_history,
                config={
                    "system_instruction": CHAT_SYSTEM_INSTRUCTION
                }
            )
            response = chat.send_message(message)
            return response.text
        except Exception as chat_err:
            print(f"✗ [Agent Fallback Error] Lỗi chat nối tiếp bằng API Key: {chat_err}")
            raise chat_err

    # Mặc định gọi Interactions API chính thống
    client = get_genai_client()
    real_id = conversation_id.replace("interactions_", "")
    try:
        print(f"[Agent] Thử gửi tin nhắn chat nối tiếp qua Interactions (previous_interaction_id={real_id})...")
        interaction = client.interactions.create(
            model="gemini-3.5-flash",
            input=message,
            previous_interaction_id=real_id,
            system_instruction=CHAT_SYSTEM_INSTRUCTION
        )
        return interaction.output_text
    except Exception as e:
        print(f"! [Agent Warning] Lỗi chat nối tiếp Interactions: {e}")
        print("💡 [Agent Fallback] Đang tự động chuyển hướng sang client.chats.create bằng API Key...")
        try:
            api_key = os.getenv("GEMINI_API_KEY")
            fallback_client = genai.Client(api_key=api_key)
            chat = fallback_client.chats.create(
                model="gemini-2.5-flash",
                history=chat_history,
                config={
                    "system_instruction": CHAT_SYSTEM_INSTRUCTION
                }
            )
            response = chat.send_message(message)
            return response.text
        except Exception as fallback_err:
            print(f"✗ [Agent Error] Thất bại hoàn toàn ở cả hai chế độ: {fallback_err}")
            raise fallback_err
