import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ChatMessage } from '../types';

interface InteractiveChatProps {
  messages: ChatMessage[];
  sendChatMessage: (text: string) => Promise<void>;
  isChatting: boolean;
}

export const InteractiveChat: React.FC<InteractiveChatProps> = ({
  messages,
  sendChatMessage,
  isChatting,
}) => {
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Tự động cuộn xuống khi có tin nhắn mới
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatting]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isChatting) return;
    sendChatMessage(inputText);
    setInputText('');
  };

  return (
    <div className="flex flex-col rounded-2xl glass p-5 md:p-6 w-full h-[400px] transition-all duration-300">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-violet-500/10 pb-3 mb-4">
        <span className="text-xl">💬</span>
        <div>
          <h3 className="text-sm font-bold text-neutral-200">
            Tương tác cùng 2 Host AI
          </h3>
          <p className="text-[10px] text-neutral-500">
            Hãy bình luận/đặt thêm câu hỏi, Rookie và Cynic sẽ tiếp tục tranh luận cùng bạn!
          </p>
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4 mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
            <span className="text-3xl mb-2">🤔</span>
            <p className="text-xs text-neutral-500 italic max-w-xs">
              Chưa có bình luận nào. Hãy gửi một tin nhắn bất kỳ để xem phản ứng trái ngược của Rookie & Cynic!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isRookie = msg.sender === 'rookie';
            
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] ${
                  isUser ? 'self-end flex-row-reverse' : 'self-start'
                }`}
              >
                {/* Avatar */}
                {!isUser && (
                  <div className={`relative w-8 h-8 rounded-full border overflow-hidden shrink-0 ${
                    isRookie ? 'border-teal-400 bg-teal-950/40' : 'border-orange-500 bg-orange-950/40'
                  }`}>
                    <Image
                      src={isRookie ? '/avatar_rookie.png' : '/avatar_cynic.png'}
                      alt={msg.sender}
                      fill
                      sizes="32px"
                      className="object-cover"
                    />
                  </div>
                )}

                {/* Bong bóng tin nhắn */}
                <div className="flex flex-col">
                  {/* Tên người gửi */}
                  {!isUser && (
                    <span className={`text-[10px] font-bold mb-1 px-1 ${
                      isRookie ? 'text-teal-400' : 'text-orange-400'
                    }`}>
                      {isRookie ? 'Rookie' : 'Cynic'}
                    </span>
                  )}
                  <div className={`px-3.5 py-2 rounded-xl text-xs leading-relaxed border ${
                    isUser
                      ? 'bg-violet-600/30 border-violet-500/30 text-violet-100 rounded-tr-none'
                      : isRookie
                      ? 'bg-teal-950/30 border-teal-500/20 text-teal-100 rounded-tl-none'
                      : 'bg-orange-950/30 border-orange-500/20 text-orange-100 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Loading "Hai Host đang gõ phản hồi..." */}
        {isChatting && (
          <div className="flex gap-3 self-start max-w-[80%] animate-pulse">
            <div className="w-8 h-8 rounded-full border border-violet-500/20 bg-violet-950/30 flex items-center justify-center shrink-0 text-sm">
              🤖
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-violet-400 px-1">Host AI</span>
              <div className="px-3.5 py-2.5 rounded-xl rounded-tl-none bg-violet-955/20 border border-violet-500/10 flex items-center gap-1.5 min-w-[70px] justify-center">
                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          disabled={isChatting}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Viết bình luận của bạn tại đây..."
          className="flex-1 bg-violet-950/10 border border-violet-500/15 rounded-xl px-4 py-2.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all duration-200"
        />
        <button
          type="submit"
          disabled={isChatting || !inputText.trim()}
          className="px-4 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-md disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-violet-500/35 transition-all duration-200 shrink-0"
        >
          Gửi
        </button>
      </form>
    </div>
  );
};
