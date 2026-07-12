'use client';

import React from 'react';
import { useHahaNote } from '../hooks/useHahaNote';
import { InputForm } from '../components/InputForm';
import { Stage } from '../components/Stage';
import { InteractiveChat } from '../components/InteractiveChat';

export default function Home() {
  const {
    script,
    isGenerating,
    isChatting,
    error,
    playingIndex,
    isPlaying,
    chatMessages,
    generateScript,
    sendChatMessage,
    playNext,
    playPrev,
    togglePlay,
    setPlayingIndex,
  } = useHahaNote();

  return (
    <div className="min-h-screen w-full flex flex-col px-4 md:px-8 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-col items-center text-center gap-2 mb-8 md:mb-12 mt-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl md:text-5xl animate-bounce">🎙️</span>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-300 via-violet-400 to-orange-400">
            HahaNotes
          </h1>
        </div>
        <p className="text-sm md:text-base text-neutral-400 font-medium max-w-lg mt-2">
          Nơi xả stress cực mạnh cùng hai Host AI đối thoại châm biếm: <span className="text-teal-300">Rookie</span> ngây thơ và <span className="text-orange-400">Cynic</span> trải đời!
        </p>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 flex flex-col lg:flex-row gap-6 items-start w-full">
        {/* Cột trái: Cấu hình và nhập nỗi lòng */}
        <div className="w-full lg:w-[380px] shrink-0">
          <InputForm generateScript={generateScript} isGenerating={isGenerating} />
        </div>

        {/* Cột phải: Sân khấu phát kịch bản và chat tương tác */}
        <div className="flex-1 flex flex-col gap-6 w-full">
          {/* Thông báo lỗi nếu có */}
          {error && (
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-950/20 text-red-300 text-xs md:text-sm shadow-md">
              ⚠️ <strong>Lỗi kết nối Backend:</strong> {error}. Hãy chắc chắn rằng bạn đã khởi chạy FastAPI Backend bằng lệnh `python api/index.py` trên cổng 8081.
            </div>
          )}

          {/* Sân khấu chính */}
          <Stage
            script={script}
            playingIndex={playingIndex}
            isPlaying={isPlaying}
            isGenerating={isGenerating}
            playNext={playNext}
            playPrev={playPrev}
            togglePlay={togglePlay}
            setPlayingIndex={setPlayingIndex}
          />

          {/* Khung chat tương tác (chỉ hiện sau khi kịch bản đã được sinh ra) */}
          {script && (
            <div className="animate-[pop-in_0.4s_ease-out_forwards]">
              <InteractiveChat
                messages={chatMessages}
                sendChatMessage={sendChatMessage}
                isChatting={isChatting}
              />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 mb-6 border-t border-violet-500/10 pt-4 text-center">
        <p className="text-[11px] text-neutral-500">
          HahaNotes Sprint 1 — Được thiết kế và xây dựng với Vibe Code + Ousterhout. Powered by Google Gemini Interactions API & Next.js.
        </p>
      </footer>
    </div>
  );
}
