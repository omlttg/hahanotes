import React, { useState } from 'react';

interface InputFormProps {
  generateScript: (
    input: string,
    category: string,
    topic: string,
    rookieVoice: string,
    cynicVoice: string
  ) => Promise<void>;
  isGenerating: boolean;
}

const CATEGORIES = [
  { id: 'Chế độ Học Không Quạo', name: 'Học Không Quạo 🎓', desc: 'Dành riêng cho sĩ tử, sinh viên trước mùa thi cử.' },
  { id: 'Vả Vào Stress', name: 'Vả Vào Stress 💥', desc: 'Giải tỏa áp lực văn phòng, sếp hãm, OT không lương.' },
  { id: 'Hóng Biến Tech', name: 'Hóng Biến Tech 💻', desc: 'Châm biếm lỗi code, deadline dí, sập database.' },
];

const TOPICS = [
  { id: 'Học đường', name: 'Học đường 🏫' },
  { id: 'Công sở', name: 'Công sở 🏢' },
  { id: 'Tech', name: 'Tech 🖥️' },
  { id: 'Đời sống', name: 'Đời sống 🥑' },
];

const ROOKIE_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Nữ trẻ trung) 👧' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Nữ ấm áp) 👩' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Nữ nhí nhảnh) 🧒' },
];

const CYNIC_VOICES = [
  { id: 'N2lVS1w75z9C374a9uYx', name: 'Adam (Nam sương gió) 🧔' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (Nam trầm) 👨' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Nam đĩnh đạc) 🧑' },
];

const SUGGESTIONS: Record<string, string[]> = {
  'Chế độ Học Không Quạo': [
    'Học thuộc lòng 50 trang lịch sử trong 1 đêm.',
    'Giảng viên bảo đề thi mở nhưng mở mắt ra không thấy làm được câu nào.',
    'Bài tập nhóm 5 người nhưng 4 người bốc hơi, 1 người gánh team.',
  ],
  'Vả Vào Stress': [
    'Sếp gửi tin nhắn giao task gấp lúc 11 giờ đêm chủ nhật.',
    'Đồng nghiệp hay nói đạo lý nhưng chuyên gia đẩy việc cho người khác.',
    'Công ty thông báo cắt giảm teambuilding chuyển sang học nội bộ.',
  ],
  'Hóng Biến Tech': [
    'Tính năng vừa deploy lên production lúc thứ sáu thì sập hệ thống.',
    'Khách hàng muốn thiết kế hệ thống giống Facebook nhưng ngân sách 5 triệu.',
    'Fix xong 1 bug thì mọc ra thêm 10 bug mới.',
  ],
};

export const InputForm: React.FC<InputFormProps> = ({ generateScript, isGenerating }) => {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].id);
  const [selectedTopic, setSelectedTopic] = useState(TOPICS[0].id);
  const [rookieVoice, setRookieVoice] = useState(ROOKIE_VOICES[0].id);
  const [cynicVoice, setCynicVoice] = useState(CYNIC_VOICES[0].id);
  const [userInput, setUserInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isGenerating) return;
    generateScript(userInput, selectedCategory, selectedTopic, rookieVoice, cynicVoice);
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isGenerating) return;
    setUserInput(suggestion);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-2xl glass p-6 md:p-8 w-full transition-all duration-300">
      <div>
        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-300 to-teal-300">
          Cấu Hình HahaNote
        </h2>
        <p className="text-xs text-neutral-400 mt-1">
          Thiết lập thể loại, chủ đề và nỗi lòng để bắt đầu xả stress.
        </p>
      </div>

      {/* 1. Chọn Category */}
      <div className="flex flex-col gap-2.5">
        <label className="text-sm font-semibold text-neutral-300">1. Chọn Thể Loại</label>
        <div className="grid grid-cols-1 gap-3">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                disabled={isGenerating}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setUserInput(''); // Reset input để hiện gợi ý mới
                }}
                className={`flex flex-col text-left p-3.5 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? 'border-violet-500 bg-violet-950/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]'
                    : 'border-violet-500/10 bg-violet-950/5 hover:border-violet-500/30'
                }`}
              >
                <span className={`font-bold text-sm ${isSelected ? 'text-violet-300' : 'text-neutral-300'}`}>
                  {cat.name}
                </span>
                <span className="text-[11px] text-neutral-400 mt-1 line-clamp-1">
                  {cat.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Chọn Topic */}
      <div className="flex flex-col gap-2.5">
        <label className="text-sm font-semibold text-neutral-300">2. Chọn Chủ Đề</label>
        <div className="grid grid-cols-2 gap-2">
          {TOPICS.map((topic) => {
            const isSelected = selectedTopic === topic.id;
            return (
              <button
                key={topic.id}
                type="button"
                disabled={isGenerating}
                onClick={() => setSelectedTopic(topic.id)}
                className={`py-2 px-3 text-xs font-semibold rounded-lg text-center border transition-all duration-200 ${
                  isSelected
                    ? 'border-teal-500 bg-teal-950/20 text-teal-300 shadow-[0_0_10px_rgba(45,212,191,0.1)]'
                    : 'border-teal-500/10 bg-teal-950/5 text-neutral-400 hover:border-teal-500/30'
                }`}
              >
                {topic.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Giọng đọc (Host Voices) */}
      <div className="flex flex-col gap-2.5">
        <label className="text-sm font-semibold text-neutral-300">Giọng Đọc Host AI</label>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-neutral-400 font-medium">Rookie (Tấm Chiếu Mới)</span>
            <select
              disabled={isGenerating}
              value={rookieVoice}
              onChange={(e) => setRookieVoice(e.target.value)}
              className="bg-violet-950/20 border border-violet-500/15 rounded-lg px-2.5 py-2 text-xs text-neutral-200 focus:outline-none focus:border-violet-500/40 transition-colors cursor-pointer"
            >
              {ROOKIE_VOICES.map((v) => (
                <option key={v.id} value={v.id} className="bg-neutral-900">
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-neutral-400 font-medium">Cynic (Trải Sự Đời)</span>
            <select
              disabled={isGenerating}
              value={cynicVoice}
              onChange={(e) => setCynicVoice(e.target.value)}
              className="bg-violet-950/20 border border-violet-500/15 rounded-lg px-2.5 py-2 text-xs text-neutral-200 focus:outline-none focus:border-violet-500/40 transition-colors cursor-pointer"
            >
              {CYNIC_VOICES.map((v) => (
                <option key={v.id} value={v.id} className="bg-neutral-900">
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3. Nhập câu chuyện */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-neutral-300">3. Nỗi Lòng Của Bạn</label>
          <span className="text-[10px] text-neutral-500">Bắt buộc</span>
        </div>
        
        <textarea
          disabled={isGenerating}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Hãy kể ngắn gọn nỗi bức xúc của bạn tại đây... (Ví dụ: deadline dí sát nút mà API vẫn chưa chạy được)"
          rows={3}
          className="w-full bg-violet-950/10 border border-violet-500/15 rounded-xl px-4 py-3 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all duration-200"
        />

        {/* Suggestion list */}
        <div className="flex flex-col gap-1.5 mt-1">
          <span className="text-[10px] text-neutral-500 font-medium">💡 Gợi ý nhanh cho thể loại này:</span>
          <div className="flex flex-col gap-1">
            {SUGGESTIONS[selectedCategory]?.map((sug, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSuggestionClick(sug)}
                className="text-left text-[11px] text-violet-400/80 hover:text-violet-300 transition-colors duration-150 line-clamp-1 py-0.5"
              >
                • {sug}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isGenerating || !userInput.trim()}
        className="w-full py-3.5 px-6 rounded-xl font-bold text-sm tracking-wider uppercase text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-600/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none hover:shadow-violet-500/35 transition-all duration-200"
      >
        {isGenerating ? (
          <div className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
            Đang Biên Kịch...
          </div>
        ) : (
          'Tạo HahaNote 🎙️'
        )}
      </button>
    </form>
  );
};
