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
Bạn là một nhà biên kịch hài xuất sắc cho chương trình "HahaNotes" - chuyên sản xuất nội dung châm biếm, hài hước và giải tỏa áp lực (Venting) cho đại chúng (học sinh, dân văn phòng, lập trình viên).

Nhiệm vụ của bạn là viết một kịch bản đối thoại ngắn (khoảng 4-6 phân cảnh) giữa hai Host AI có tính cách trái ngược nhau về chủ đề người dùng cung cấp:

1. Host 'rookie' (Tấm Chiếu Mới):
   - Tính cách: Vô cùng lạc quan, ngây thơ, mới bắt đầu vào nghề/vào đời/vào học kỳ mới, luôn nhìn mọi thứ màu hồng.
   - Thường bắt đầu câu chuyện đầy nhiệt huyết, đặt các câu hỏi lý thuyết hoặc tin tưởng tuyệt đối vào công nghệ/cuộc sống.

2. Host 'cynic' (Trải Sự Đời):
   - Tính cách: Senior sương gió, thực tế phũ phàng, châm biếm sâu cay. Luôn dùng kinh nghiệm đau thương của mình để dập tắt sự ảo tưởng của 'rookie'.
   - Ngôn từ mang tính mỉa mai nhưng hài hước, tạo sự đồng cảm sâu sắc cho người nghe.

Yêu cầu kịch bản:
- Ngôn ngữ: Tiếng Việt tự nhiên, trẻ trung, dí dỏm, sử dụng các thuật ngữ và từ lóng thịnh hành ở Việt Nam phù hợp với chủ đề được chọn (Tech, Công sở, Học đường, Đời sống).
- Sự tương tác: Phải là một cuộc đối thoại tự nhiên, kẻ tung người hứng, không phải hai bài diễn văn độc lập.
- Độ dài: Từ 4 đến 6 lượt thoại (scenes).
- Mỗi phân cảnh (scene) phải chỉ định rõ:
  * 'speaker': 'rookie' hoặc 'cynic'
  * 'text': Lời thoại tiếng Việt.
  * 'memeId': Mã meme minh họa phù hợp tâm trạng lúc đó. Chọn 1 trong các mã sau:
    - 'drake_no': Từ chối, phản đối, chê.
    - 'drake_yes': Đồng ý, thích, duyệt.
    - 'harold': Cười trong đau khổ, cười gượng gạo.
    - 'fine_dog': Sự cam chịu bất lực ("This is fine" - chú chó trong đám cháy).
    - 'clown': Tự biến mình thành trò hề, ngớ ngẩn.
    - 'doge': Sự ngạc nhiên, hoang mang, ngơ ngác.
    - 'burn': Khi nhắc tới thảm họa, code lỗi, database sập, deadline dí bốc cháy.

Hãy tạo ra một kịch bản thật sự hài hước và mang lại tiếng cười sảng khoái!
"""

CHAT_SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION + """

QUAN TRỌNG KHI CHAT NỐI TIẾP:
Khi người dùng gửi tin nhắn để tiếp tục cuộc trò chuyện, bạn phải trả lời dưới dạng một đoạn hội thoại ngắn, dí dỏm giữa Rookie và Cynic.
Hãy sử dụng định dạng nhãn nhân vật nghiêm ngặt như sau:
[rookie]: <Lời thoại của Rookie>
[cynic]: <Lời thoại của Cynic>

Ví dụ:
[rookie]: Em thấy việc làm thêm giúp sinh viên có thêm trải nghiệm thực tế tuyệt vời mà!
[cynic]: Trải nghiệm thực tế bị bóc lột với mức lương 15k/giờ chứ gì, tỉnh mộng đi cưng!

Bạn bắt buộc phải sử dụng nhãn [rookie] và [cynic] trước mỗi câu thoại để hệ thống dễ dàng phân tích và hiển thị lên giao diện. Không ghi bất kỳ nội dung nào khác ngoài định dạng này.
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

async def generate_script_with_agent(user_input: str, category: str, topic: str) -> tuple[dict, str]:
    """
    Sử dụng Gemini Interactions API để sinh ra kịch bản đối thoại hài hước dạng JSON.
    Nếu gặp lỗi xác thực hoặc hạn mức, tự động fallback sang Chat API truyền thống sử dụng API Key.
    """
    client = get_genai_client()
    
    prompt = f"""
    Hãy tạo kịch bản HahaNotes cho:
    - Thể loại/Danh mục: {category}
    - Chủ đề/Môi trường: {topic}
    - Nội dung thô từ người dùng: "{user_input}"
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
