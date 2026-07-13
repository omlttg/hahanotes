'use client';

import React, { useState } from 'react';
import { HahaNoteScript } from '../types';
import { VideoPlayer } from './VideoPlayer';

interface HahaNotesCardProps {
  script: HahaNoteScript;
  rookieVoice?: string;
  cynicVoice?: string;
  enableBgm?: boolean;
  enableSfx?: boolean;
}

export const HahaNotesCard: React.FC<HahaNotesCardProps> = ({
  script,
  rookieVoice = '',
  cynicVoice = '',
  enableBgm = true,
  enableSfx = true
}) => {
  const [activeTab, setActiveTab] = useState<'podcast' | 'video'>('podcast');
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [isDownloadingPodcast, setIsDownloadingPodcast] = useState(false);

  // Tạo URL podcast hoàn chỉnh ghép nối từ backend
  const API_BASE = typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
       ? 'http://localhost:8081'
       : '')
    : '';
    
  // Helper to serialize script scenes to URL safe Base64 for stateless Vercel backend
  const serializeScript = (scenes: any[]) => {
    try {
      const data = scenes.map(s => ({ s: s.speaker === 'rookie' ? 'r' : 'c', t: s.text }));
      const jsonStr = JSON.stringify(data);
      return btoa(unescape(encodeURIComponent(jsonStr)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } catch (e) {
      console.error("Failed to serialize script", e);
      return "";
    }
  };

  const queryParams = new URLSearchParams();
  if (rookieVoice) queryParams.set('rookieVoice', rookieVoice);
  if (cynicVoice) queryParams.set('cynicVoice', cynicVoice);
  queryParams.set('enableBgm', enableBgm ? 'true' : 'false');
  queryParams.set('enableSfx', enableSfx ? 'true' : 'false');
  const scriptParam = serializeScript(script.scenes);
  if (scriptParam) queryParams.set('script', scriptParam);
  
  const podcastUrl = `${API_BASE}/api/podcast/${script.conversation_id}.mp3?${queryParams.toString()}`;

  // Tải Podcast Audio
  const handleDownloadPodcast = async () => {
    setIsDownloadingPodcast(true);
    try {
      const response = await fetch(podcastUrl);
      if (!response.ok) throw new Error("Failed to download podcast");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hahanotes_podcast_${script.conversation_id}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Lỗi tải Podcast. Vui lòng thử lại sau.");
    } finally {
      setIsDownloadingPodcast(false);
    }
  };

  // Tải Short Video sau khi Canvas record xong
  const handleVideoExportComplete = (blob: Blob) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Cho phép tải xuống dưới dạng .webm hoặc .mp4 (webm tương thích hầu hết MXH)
    a.download = `hahanotes_short_${script.conversation_id}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    setIsExportingVideo(false);
  };

  return (
    <div className="w-full bg-slate-950/40 backdrop-blur-md border border-indigo-500/20 rounded-2xl overflow-hidden shadow-xl p-4 md:p-6 transition-all hover:border-indigo-500/30">
      {/* Header của Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800">
        <div>
          <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
            🎙️ HahaNotes Show v2
          </span>
          <h3 className="text-lg md:text-xl font-extrabold text-neutral-100 mt-1 max-w-lg">
            {script.title}
          </h3>
        </div>

        {/* Nút Tab chuyển đổi */}
        <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 self-start">
          <button
            onClick={() => !isExportingVideo && setActiveTab('podcast')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'podcast'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            disabled={isExportingVideo}
          >
            🎙️ Podcast
          </button>
          <button
            onClick={() => !isExportingVideo && setActiveTab('video')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'video'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            disabled={isExportingVideo}
          >
            📱 Short Video
          </button>
        </div>
      </div>

      {/* Nội dung Tab */}
      <div className="w-full flex flex-col items-center justify-center">
        {activeTab === 'podcast' ? (
          <div className="w-full max-w-[400px] flex flex-col items-center gap-6 py-4">
            {/* Visualizer Sóng âm giả lập */}
            <div className="flex items-center gap-1 justify-center h-16 w-full px-4">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="bg-indigo-500/80 rounded-full w-1.5 transition-all duration-300 animate-[pulse_1s_infinite]"
                  style={{
                    height: `${15 + Math.random() * 80}%`,
                    animationDelay: `${i * 0.05}s`
                  }}
                />
              ))}
            </div>

            {/* Trình phát Audio và Nút tải */}
            <div className="w-full bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col items-center gap-4">
              <audio 
                src={podcastUrl} 
                controls 
                className="w-full accent-indigo-500 bg-slate-950 rounded-lg"
              />
              
              <button
                onClick={handleDownloadPodcast}
                disabled={isDownloadingPodcast}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg disabled:opacity-50 transition-all hover:scale-[1.02]"
              >
                {isDownloadingPodcast ? (
                  <>
                    <span className="animate-spin text-lg">⚙️</span>
                    Preparing Audio File...
                  </>
                ) : (
                  <>
                    <span>📥</span>
                    Download Podcast (.mp3)
                  </>
                )}
              </button>
            </div>
            
            <p className="text-[11px] text-neutral-500 text-center">
              Includes ambient lo-fi background music and laugh track. Best heard on headphones.
            </p>
          </div>
        ) : (
          <VideoPlayer
            script={script}
            podcastUrl={podcastUrl}
            onExportComplete={handleVideoExportComplete}
            isExporting={isExportingVideo}
            setIsExporting={setIsExportingVideo}
          />
        )}
      </div>

      {/* Hiển thị kịch bản chữ phía dưới của Card */}
      <div className="mt-6 border-t border-slate-800/80 pt-4">
        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">
          📜 Show Script
        </h4>
        <div className="flex flex-col gap-3 max-h-[220px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
          {script.scenes.map((scene, idx) => (
            <div 
              key={idx} 
              className={`p-3 rounded-xl border text-xs leading-relaxed ${
                scene.speaker === 'rookie'
                  ? 'bg-teal-950/10 border-teal-500/10 text-teal-100'
                  : 'bg-orange-950/10 border-orange-500/10 text-orange-100'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold mb-1 uppercase tracking-wider text-[10px]">
                <span className={scene.speaker === 'rookie' ? 'text-teal-400' : 'text-orange-400'}>
                  {scene.speaker === 'rookie' ? '🎙️ Rookie' : '🔥 Cynic'}
                </span>
                <span className="text-[9px] bg-slate-800 text-neutral-400 px-1.5 py-0.5 rounded">
                  {scene.memeId}
                </span>
              </div>
              <p>{scene.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
