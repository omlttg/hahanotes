import React from 'react';
import Image from 'next/image';
import { HahaNoteScript } from '../types';
import { MemeResolver } from './MemeResolver';

interface StageProps {
  script: HahaNoteScript | null;
  playingIndex: number;
  isPlaying: boolean;
  isGenerating: boolean;
  playNext: () => void;
  playPrev: () => void;
  togglePlay: () => void;
  setPlayingIndex: (idx: number) => void;
}

export const Stage: React.FC<StageProps> = ({
  script,
  playingIndex,
  isPlaying,
  isGenerating,
  playNext,
  playPrev,
  togglePlay,
  setPlayingIndex,
}) => {
  // Trạng thái loading tinh tế
  if (isGenerating) {
    return (
      <div className="relative flex flex-col items-center justify-center rounded-2xl glass p-12 min-h-[350px] overflow-hidden text-center w-full">
        {/* Sóng âm / Đèn sân khấu AI */}
        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
          <div className="w-96 h-96 rounded-full bg-violet-600 blur-3xl animate-pulse"></div>
        </div>
        
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="flex gap-1.5 justify-center items-end h-12">
            <span className="w-1.5 h-6 bg-violet-500 rounded-full animate-[bounce_1s_infinite_100ms]"></span>
            <span className="w-1.5 h-10 bg-teal-400 rounded-full animate-[bounce_1s_infinite_200ms]"></span>
            <span className="w-1.5 h-8 bg-violet-500 rounded-full animate-[bounce_1s_infinite_300ms]"></span>
            <span className="w-1.5 h-12 bg-pink-500 rounded-full animate-[bounce_1s_infinite_400ms]"></span>
            <span className="w-1.5 h-6 bg-teal-400 rounded-full animate-[bounce_1s_infinite_500ms]"></span>
          </div>
          <h3 className="text-xl font-semibold text-violet-300 tracking-wide">
            Đang thảo luận kịch bản...
          </h3>
          <p className="text-sm text-neutral-400 max-w-sm">
            Rookie đang hào hứng đề xuất ý tưởng, còn Cynic thì đang sửa soạn cốc cà phê để chuẩn bị dội gáo nước lạnh...
          </p>
        </div>
      </div>
    );
  }

  // Trạng thái trống
  if (!script) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl glass p-12 min-h-[350px] text-center w-full">
        <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-3xl mb-4 animate-bounce">
          🎙️
        </div>
        <h3 className="text-lg font-medium text-neutral-200">Sân Khấu HahaNotes Sẵn Sàng</h3>
        <p className="text-sm text-neutral-500 mt-2 max-w-xs">
          Hãy chọn một chủ đề hoặc nhập một nỗi lòng bức xúc của bạn ở bảng bên cạnh để hai Host AI bắt đầu lên kịch bản!
        </p>
      </div>
    );
  }

  const currentScene = playingIndex >= 0 && playingIndex < script.scenes.length
    ? script.scenes[playingIndex]
    : null;

  return (
    <div className="flex flex-col rounded-2xl glass p-6 md:p-8 w-full transition-all duration-300">
      {/* Script Title */}
      <div className="flex items-center justify-between border-b border-violet-500/10 pb-4 mb-6">
        <div>
          <span className="text-xs text-teal-400 uppercase tracking-widest font-semibold">Tập Phát Sóng Mới Nhất</span>
          <h2 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-300 via-neutral-100 to-teal-300">
            {script.title}
          </h2>
        </div>
        {playingIndex >= 0 && (
          <div className="text-xs text-neutral-400 bg-violet-950/40 border border-violet-500/20 px-2.5 py-1 rounded-full">
            Phân cảnh {playingIndex + 1} / {script.scenes.length}
          </div>
        )}
      </div>

      {/* Sân Khấu Chính */}
      <div className="relative flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 min-h-[220px] mb-8 py-4">
        {/* Rookie (Tấm chiếu mới) */}
        <div className={`flex flex-col items-center gap-3 transition-all duration-300 order-2 md:order-1 ${
          currentScene && currentScene.speaker === 'rookie' 
            ? 'scale-105 opacity-100 filter drop-shadow-[0_0_20px_rgba(45,212,191,0.3)]' 
            : 'scale-95 opacity-50'
        }`}>
          <div className="relative">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-teal-400 bg-teal-950/40 overflow-hidden">
              <Image
                src="/avatar_rookie.png"
                alt="Rookie"
                fill
                sizes="(max-width: 768px) 80px, 96px"
                className="object-cover"
              />
            </div>
            {/* Visualizer sóng âm */}
            {isPlaying && currentScene && currentScene.speaker === 'rookie' && (
              <div className="absolute bottom-0 right-0 bg-teal-950 border border-teal-400/30 rounded-full px-2 py-1.5 flex gap-0.5 shadow-lg items-end z-20">
                <span className="w-0.5 h-2 bg-teal-400 rounded-full animate-[bounce_0.8s_infinite_100ms]"></span>
                <span className="w-0.5 h-4.5 bg-teal-400 rounded-full animate-[bounce_0.8s_infinite_300ms]"></span>
                <span className="w-0.5 h-3 bg-teal-400 rounded-full animate-[bounce_0.8s_infinite_200ms]"></span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center">
            <span className="font-bold text-teal-300 text-sm tracking-wide">Rookie</span>
            <span className="text-[10px] text-teal-500 uppercase font-semibold">Tấm Chiếu Mới</span>
          </div>
        </div>

        {/* Khu vực Đối thoại và Meme */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[140px] px-2 relative order-1 md:order-2 w-full">
          {currentScene ? (
            <div className="w-full flex flex-col items-center gap-4 animate-[pop-in_0.4s_ease-out_forwards]">
              {/* Bong bóng thoại */}
              <div className={`relative px-6 py-4 rounded-2xl text-center max-w-md w-full border ${
                currentScene.speaker === 'rookie'
                  ? 'bg-teal-950/20 border-teal-500/20 text-teal-100 shadow-[0_4px_20px_rgba(45,212,191,0.05)]'
                  : 'bg-orange-950/20 border-orange-500/20 text-orange-100 shadow-[0_4px_20px_rgba(249,115,22,0.05)]'
              }`}>
                {/* Đuôi bong bóng thoại */}
                <div className={`absolute bottom-[-6px] left-[50%] translate-x-[-50%] w-3 h-3 rotate-45 border-b border-r ${
                  currentScene.speaker === 'rookie'
                    ? 'bg-[#120b1e] border-teal-500/20'
                    : 'bg-[#120b1e] border-orange-500/20'
                }`}></div>
                
                <p className="text-base md:text-lg font-medium leading-relaxed">
                  "{currentScene.text}"
                </p>
              </div>

              {/* Meme nổi lên */}
              {currentScene.memeId && (
                <div className="relative mt-2">
                  <MemeResolver memeId={currentScene.memeId} />
                </div>
              )}
            </div>
          ) : (
            <p className="text-neutral-500 italic text-sm text-center">Bấm Play để xem show diễn</p>
          )}
        </div>

        {/* Cynic (Trải sự đời) */}
        <div className={`flex flex-col items-center gap-3 transition-all duration-300 order-3 ${
          currentScene && currentScene.speaker === 'cynic' 
            ? 'scale-105 opacity-100 filter drop-shadow-[0_0_20px_rgba(249,115,22,0.3)]' 
            : 'scale-95 opacity-50'
        }`}>
          <div className="relative">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-orange-500 bg-orange-950/40 overflow-hidden">
              <Image
                src="/avatar_cynic.png"
                alt="Cynic"
                fill
                sizes="(max-width: 768px) 80px, 96px"
                className="object-cover"
              />
            </div>
            {/* Visualizer sóng âm */}
            {isPlaying && currentScene && currentScene.speaker === 'cynic' && (
              <div className="absolute bottom-0 right-0 bg-orange-950 border border-orange-500/30 rounded-full px-2 py-1.5 flex gap-0.5 shadow-lg items-end z-20">
                <span className="w-0.5 h-2 bg-orange-400 rounded-full animate-[bounce_0.8s_infinite_100ms]"></span>
                <span className="w-0.5 h-4.5 bg-orange-400 rounded-full animate-[bounce_0.8s_infinite_300ms]"></span>
                <span className="w-0.5 h-3 bg-orange-400 rounded-full animate-[bounce_0.8s_infinite_200ms]"></span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center">
            <span className="font-bold text-orange-400 text-sm tracking-wide">Cynic</span>
            <span className="text-[10px] text-orange-500 uppercase font-semibold">Trải Sự Đời</span>
          </div>
        </div>
      </div>

      {/* Bộ điều khiển */}
      <div className="flex flex-col items-center gap-4 border-t border-violet-500/10 pt-5">
        <div className="flex items-center justify-center gap-4">
          {/* Back button */}
          <button
            onClick={playPrev}
            disabled={playingIndex <= 0}
            className="w-10 h-10 rounded-full flex items-center justify-center border border-violet-500/20 bg-violet-950/30 text-violet-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-violet-500/20 hover:border-violet-500/40 transition-all duration-200"
            title="Quay lại"
          >
            ⏮️
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95 transition-all duration-200 hover:shadow-violet-500/40"
            style={{ animation: isPlaying ? 'pulse-glow 2s infinite' : 'none' }}
          >
            {isPlaying ? (
              <span className="text-xl">⏸️</span>
            ) : (
              <span className="text-xl pl-1">▶️</span>
            )}
          </button>

          {/* Next button */}
          <button
            onClick={playNext}
            disabled={playingIndex >= script.scenes.length - 1}
            className="w-10 h-10 rounded-full flex items-center justify-center border border-violet-500/20 bg-violet-950/30 text-violet-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-violet-500/20 hover:border-violet-500/40 transition-all duration-200"
            title="Câu kế tiếp"
          >
            ⏭️
          </button>
        </div>

        {/* Thanh Progress bar nhỏ có thể click chuyển câu */}
        <div className="w-full max-w-md flex gap-1 items-center justify-center px-4">
          {script.scenes.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setPlayingIndex(idx)}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                idx === playingIndex 
                  ? 'bg-gradient-to-r from-teal-400 to-violet-500' 
                  : idx < playingIndex 
                  ? 'bg-violet-500/50' 
                  : 'bg-violet-950/60 border border-violet-500/10'
              }`}
            ></button>
          ))}
        </div>
      </div>
    </div>
  );
};
