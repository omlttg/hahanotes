#!/bin/bash

# Tự động dừng tất cả các tiến trình con khi tắt terminal hoặc bấm Ctrl+C
trap "kill 0" EXIT

echo "=========================================================="
echo "🚀 KHỞI ĐỘNG HỆ THỐNG KIỂM THỬ LOCAL HAHANOTES"
echo "=========================================================="

# 1. Kiểm tra cấu hình .env
if [ ! -f ".env" ]; then
    echo "⚠️ Cảnh báo: Không tìm thấy file .env. Đang tạo file .env mặc định..."
    echo "GEMINI_API_KEY=" > .env
    echo "ELEVENLABS_API_KEY=" >> .env
fi

# Đọc cấu hình key từ .env
GEMINI_KEY=$(grep "GEMINI_API_KEY" .env | cut -d'=' -f2)
ELEVEN_KEY=$(grep "ELEVENLABS_API_KEY" .env | cut -d'=' -f2)

if [ -z "$GEMINI_KEY" ]; then
    echo "💡 Nhắc nhở: GEMINI_API_KEY đang trống. Vui lòng mở file .env điền key để kịch bản hoạt động."
fi

if [ -z "$ELEVEN_KEY" ]; then
    echo "🔊 Nhắc nhở: ELEVENLABS_API_KEY đang trống. Ứng dụng sẽ tự động chạy chế độ fallback không âm thanh (chữ chạy tự động)."
else
    echo "🎙️ ElevenLabs API Key đã được cấu hình. Giọng nói và sóng âm visualizer sẵn sàng!"
fi

# 2. Khởi chạy Backend FastAPI
if [ -d "venv" ]; then
    echo "🐍 Đang khởi chạy Python Backend (FastAPI) qua virtual environment..."
    ./venv/bin/python api/index.py &
else
    echo "🐍 Đang khởi chạy Python Backend (FastAPI) qua python hệ thống..."
    python api/index.py &
fi

# Chờ 2 giây cho Backend sẵn sàng
sleep 2

# 3. Khởi chạy Frontend Next.js
echo "🌐 Đang khởi chạy Next.js Frontend..."
npm run dev

# Giữ tiến trình hoạt động
wait
