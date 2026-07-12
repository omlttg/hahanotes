'use client';

import React, { useRef, useState, useEffect } from 'react';
import { HahaNoteScript, Scene } from '../types';

interface VideoPlayerProps {
  script: HahaNoteScript;
  podcastUrl: string;
  onExportComplete?: (blob: Blob) => void;
  isExporting: boolean;
  setIsExporting: (val: boolean) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  script,
  podcastUrl,
  onExportComplete,
  isExporting,
  setIsExporting
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportProgress, setExportProgress] = useState(0);
  
  // Trạng thái đồng bộ hoạt họa
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const animationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Lưu danh sách mốc thời gian của các scene
  const sceneTimingsRef = useRef<{ start: number; end: number; duration: number }[]>([]);

  // Tính toán thời gian bắt đầu và kết thúc của từng scene dựa vào số từ hoặc nạp từ backend
  useEffect(() => {
    // 1. Dùng ước lượng làm fallback trước
    let currentStart = 0.5; // bắt đầu sau 500ms im lặng của podcast
    const timings = script.scenes.map((scene) => {
      const wordCount = scene.text.split(/\s+/).length;
      const duration = Math.max(3.2, wordCount * 0.38); // ước tính tốc độ đọc
      const end = currentStart + duration;
      const timing = { start: currentStart, end, duration };
      currentStart = end + 0.8; // cộng 800ms im lặng giữa các câu thoại + sfx
      return timing;
    });
    sceneTimingsRef.current = timings;

    // 2. Fetch thông tin timing chính xác từ backend
    const API_BASE = typeof window !== 'undefined'
      ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
         ? 'http://localhost:8081'
         : '')
      : '';

    const fetchExactTimings = async () => {
      try {
        let queryParams = '';
        if (podcastUrl.includes('?')) {
          queryParams = '?' + podcastUrl.split('?')[1];
        }
        
        const metadataUrl = `${API_BASE}/api/podcast/${script.conversation_id}/metadata${queryParams}`;
        const res = await fetch(metadataUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.timings && data.timings.length === script.scenes.length) {
            sceneTimingsRef.current = data.timings;
            console.log("✓ [VideoPlayer] Loaded exact scene timings from backend:", data.timings);
          }
        }
      } catch (err) {
        console.warn("⚠️ [VideoPlayer] Failed to load exact timings, using fallback:", err);
      }
    };

    fetchExactTimings();
  }, [script, podcastUrl]);

  // Vòng lặp vẽ Canvas hoạt họa
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load hình ảnh avatar
    const imgRookie = new Image();
    imgRookie.src = '/avatar_rookie.png';
    const imgCynic = new Image();
    imgCynic.src = '/avatar_cynic.png';

    // Preload các hình ảnh meme để minh họa hài hước
    const memeImages: Record<string, HTMLImageElement> = {};
    const memeIds = ['clown', 'harold', 'fine_dog', 'drake_no', 'drake_yes', 'doge', 'burn'];
    memeIds.forEach(id => {
      const img = new Image();
      img.src = `/memes/${id}.png`;
      memeImages[id] = img;
    });

    // Biến trạng thái để vẽ gradient động
    let gradientOffset = 0;

    const render = () => {
      if (!ctx || !canvas) return;

      const currentTime = audioRef.current ? audioRef.current.currentTime : 0;
      
      // Tìm scene hiện tại dựa vào currentTime
      let activeIdx = 0;
      let timing = sceneTimingsRef.current[0];
      for (let i = 0; i < sceneTimingsRef.current.length; i++) {
        if (currentTime >= sceneTimingsRef.current[i].start && currentTime <= sceneTimingsRef.current[i].end) {
          activeIdx = i;
          timing = sceneTimingsRef.current[i];
          break;
        } else if (currentTime > sceneTimingsRef.current[i].end) {
          activeIdx = Math.min(i + 1, script.scenes.length - 1);
          timing = sceneTimingsRef.current[activeIdx];
        }
      }
      
      setCurrentSceneIndex(activeIdx);
      const activeScene = script.scenes[activeIdx];
      const isRookieTalking = activeScene.speaker === 'rookie' && currentTime >= timing.start && currentTime <= timing.end;
      const isCynicTalking = activeScene.speaker === 'cynic' && currentTime >= timing.start && currentTime <= timing.end;

      // 1. Vẽ Background Gradient động
      gradientOffset += 0.002;
      const grad = ctx.createRadialGradient(
        canvas.width / 2 + Math.sin(gradientOffset) * 100,
        canvas.height / 2 + Math.cos(gradientOffset * 1.5) * 150,
        50,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width
      );
      grad.addColorStop(0, '#1e1b4b'); // deep indigo
      grad.addColorStop(0.5, '#0f172a'); // slate
      grad.addColorStop(1, '#020617'); // black slate
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Vẽ lưới neon trang trí nhẹ
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.06)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // 2. Vẽ tiêu đề Podcast phía trên
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold 22px "Outfit", "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText('HahaNotes Podcast', canvas.width / 2, 45);
      
      ctx.fillStyle = '#38bdf8'; // sky blue
      ctx.font = '13px "Outfit", "Inter", sans-serif';
      ctx.fillText(script.title.toUpperCase(), canvas.width / 2, 65);
      ctx.restore();

      // 3. Vẽ Rookie (Phía trên) - Dịch lên trên nhường chỗ cho trung tâm
      const rookieY = canvas.height * 0.18;
      const rookieRadius = 55;
      const rookieScale = isRookieTalking ? 1.08 + Math.sin(Date.now() * 0.015) * 0.02 : 1.0;
      
      ctx.save();
      // Vẽ bóng sáng xung quanh khi nói
      if (isRookieTalking) {
        ctx.shadowColor = '#2dd4bf'; // teal glow
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#2dd4bf';
        ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
      }
      ctx.beginPath();
      ctx.arc(canvas.width / 2, rookieY, rookieRadius * rookieScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.clip();
      
      // Vẽ ảnh Rookie
      try {
        ctx.drawImage(
          imgRookie, 
          canvas.width / 2 - rookieRadius * rookieScale, 
          rookieY - rookieRadius * rookieScale, 
          rookieRadius * 2 * rookieScale, 
          rookieRadius * 2 * rookieScale
        );
      } catch (e) {
        // Fallback màu nếu ảnh lỗi
        ctx.fillStyle = '#0d9488';
        ctx.fillRect(canvas.width / 2 - rookieRadius, rookieY - rookieRadius, rookieRadius * 2, rookieRadius * 2);
      }
      ctx.restore();

      // Nhãn Rookie
      ctx.save();
      ctx.fillStyle = isRookieTalking ? '#2dd4bf' : 'rgba(255, 255, 255, 0.4)';
      ctx.font = 'bold 12px "Outfit", "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ROOKIE (The Optimist)', canvas.width / 2, rookieY + rookieRadius + 18);
      ctx.restore();

      // 4. Vẽ Cynic (Phía dưới) - Dịch xuống dưới nhường chỗ cho trung tâm
      const cynicY = canvas.height * 0.82;
      const cynicRadius = 55;
      const cynicScale = isCynicTalking ? 1.08 + Math.sin(Date.now() * 0.015) * 0.02 : 1.0;
      
      ctx.save();
      if (isCynicTalking) {
        ctx.shadowColor = '#fb923c'; // orange glow
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
      }
      ctx.beginPath();
      ctx.arc(canvas.width / 2, cynicY, cynicRadius * cynicScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.clip();
      
      // Vẽ ảnh Cynic
      try {
        ctx.drawImage(
          imgCynic, 
          canvas.width / 2 - cynicRadius * cynicScale, 
          cynicY - cynicRadius * cynicScale, 
          cynicRadius * 2 * cynicScale, 
          cynicRadius * 2 * cynicScale
        );
      } catch (e) {
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(canvas.width / 2 - cynicRadius, cynicY - cynicRadius, cynicRadius * 2, cynicRadius * 2);
      }
      ctx.restore();

      // Nhãn Cynic
      ctx.save();
      ctx.fillStyle = isCynicTalking ? '#fb923c' : 'rgba(255, 255, 255, 0.4)';
      ctx.font = 'bold 12px "Outfit", "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CYNIC (The Realist)', canvas.width / 2, cynicY + cynicRadius + 18);
      ctx.restore();

      // 4.5. Vẽ Meme hoạt họa minh họa ở trung tâm (Hài hước hóa)
      const activeMemeId = activeScene.memeId;
      const memeImg = memeImages[activeMemeId];
      if (memeImg && memeImg.complete) {
        ctx.save();
        const memeCenterY = canvas.height * 0.43;
        // Rung nhẹ theo giọng nói để thêm tính động
        const speakFactor = (isRookieTalking || isCynicTalking) ? Math.sin(Date.now() * 0.015) * 0.03 : 0;
        const scale = 1.0 + speakFactor;
        ctx.translate(canvas.width / 2, memeCenterY);
        ctx.scale(scale, scale);

        // Viền rực rỡ neon xung quanh meme
        ctx.shadowColor = activeScene.speaker === 'rookie' ? '#2dd4bf' : '#fb923c';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#1e1b4b'; // deep indigo fill
        ctx.strokeStyle = activeScene.speaker === 'rookie' ? '#2dd4bf' : '#fb923c';
        ctx.lineWidth = 3;

        // Khung ảnh Polaroid hài hước
        const frameW = 200;
        const frameH = 135;
        ctx.beginPath();
        ctx.roundRect(-frameW / 2, -frameH / 2, frameW, frameH, 10);
        ctx.fill();
        ctx.stroke();

        // Clip vẽ ảnh meme bên trong khung
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(-frameW / 2 + 6, -frameH / 2 + 6, frameW - 12, frameH - 32, 6);
        ctx.clip();
        try {
          ctx.drawImage(memeImg, -frameW / 2 + 6, -frameH / 2 + 6, frameW - 12, frameH - 32);
        } catch (e) {
          // ignore
        }
        ctx.restore();

        // Tên meme ở đáy khung polaroid
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '800 10px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(activeMemeId.toUpperCase() + ' MODE', 0, frameH / 2 - 8);
        ctx.restore();
      }

      // 5. Vẽ Phụ đề Karaoke (Đưa xuống Y = canvas.height * 0.63 để không đè lên meme)
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const words = activeScene.text.split(/\s+/);
      const textProgress = (currentTime - timing.start) / timing.duration;
      const clampedProgress = Math.min(Math.max(0, textProgress), 1);
      
      // Tính toán từ đang nói hoạt họa Karaoke
      const wordProgressLimit = Math.floor(words.length * clampedProgress);
      setActiveWordIndex(wordProgressLimit);
      
      // Vẽ phụ đề gói dòng thông minh (Smart Wrap)
      const centerY = canvas.height * 0.63;
      ctx.font = 'bold 16px "Inter", sans-serif';
      
      const wrapText = (text: string, maxWidth: number) => {
        const wordsArr = text.split(' ');
        const linesArr = [];
        let currentLine = '';
        
        for (let n = 0; n < wordsArr.length; n++) {
          const testLine = currentLine + wordsArr[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            linesArr.push(currentLine.trim());
            currentLine = wordsArr[n] + ' ';
          } else {
            currentLine = testLine;
          }
        }
        linesArr.push(currentLine.trim());
        return linesArr;
      };

      const maxTextWidth = canvas.width - 60;
      const subtitleLines = wrapText(activeScene.text, maxTextWidth);
      
      // Vẽ nền đen mờ sau sub
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      ctx.roundRect(
        20, 
        centerY - (subtitleLines.length * 22) / 2 - 10, 
        canvas.width - 40, 
        subtitleLines.length * 24 + 16, 
        10
      );
      ctx.fill();
      
      // Vẽ chữ phụ đề
      let globalWordCounter = 0;
      
      subtitleLines.forEach((lineText, lineIdx) => {
        const lineY = centerY - ((subtitleLines.length - 1) * 24) / 2 + lineIdx * 24;
        const lineWords = lineText.split(' ');
        
        // Vẽ Karaoke từng từ
        const lineTotalWidth = ctx.measureText(lineText).width;
        let startX = (canvas.width - lineTotalWidth) / 2;
        
        lineWords.forEach((word) => {
          const wordWidth = ctx.measureText(word + ' ').width;
          
          ctx.save();
          ctx.shadowColor = 'black';
          ctx.shadowBlur = 2;
          
          // Xác định màu chữ phụ đề Karaoke
          if (globalWordCounter < wordProgressLimit) {
            ctx.fillStyle = activeScene.speaker === 'rookie' ? '#2dd4bf' : '#fb923c';
            ctx.font = 'bold 17px "Inter", sans-serif';
          } else {
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 16px "Inter", sans-serif';
          }
          
          ctx.fillText(word, startX + ctx.measureText(word).width / 2, lineY);
          ctx.restore();
          
          startX += wordWidth;
          globalWordCounter++;
        });
      });

      ctx.restore();

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [script, isPlaying]);

  // Theo dõi tiến trình âm thanh
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    const duration = audioRef.current.duration || 1;
    setProgress((current / duration) * 100);
    
    if (isExporting) {
      setExportProgress(Math.floor((current / duration) * 100));
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setProgress(100);
    
    if (isExporting && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsExporting(false);
      setExportProgress(100);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(e => console.error("Play block:", e));
      setIsPlaying(true);
    }
  };

  // Tiến hành xuất Video (Export) bằng MediaRecorder
  const handleExportVideo = async () => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;

    setIsExporting(true);
    setExportProgress(0);
    recordedChunksRef.current = [];

    // Tắt tiếng phát loa ngoài của audio chính khi record để ko ồn
    audio.muted = true;
    audio.currentTime = 0;

    // Khởi tạo AudioContext và các Node một lần duy nhất để tránh lỗi InvalidStateError
    if (!audioCtxRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioCtxRef.current = audioCtx;
        
        const sourceNode = audioCtx.createMediaElementSource(audio);
        sourceNodeRef.current = sourceNode;
        
        const destNode = audioCtx.createMediaStreamDestination();
        destNodeRef.current = destNode;
        
        sourceNode.connect(destNode);
        sourceNode.connect(audioCtx.destination);
      } catch (err) {
        console.error("AudioContext setup failed:", err);
      }
    }

    const audioCtx = audioCtxRef.current;
    const destNode = destNodeRef.current;

    if (audioCtx && audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch (err) {
        console.error("Failed to resume AudioContext:", err);
      }
    }

    // Lấy luồng video từ canvas (24 fps)
    const videoStream = canvas.captureStream(24);
    
    // Nếu setup AudioContext thành công thì gộp stream
    const tracks = [...videoStream.getVideoTracks()];
    if (destNode) {
      tracks.push(...destNode.stream.getAudioTracks());
    }

    const combinedStream = new MediaStream(tracks);

    // Chọn định dạng hỗ trợ
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm;codecs=vp8' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
      }
    }

    const recorder = new MediaRecorder(combinedStream, options);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      audio.muted = false; // bật lại tiếng loa
      if (onExportComplete) {
        onExportComplete(blob);
      }
    };

    recorder.start();
    audio.play().then(() => {
      setIsPlaying(true);
    }).catch(e => {
      console.error("Audio playback during record failed:", e);
      setIsExporting(false);
    });
  };

  return (
    <div className="flex flex-col items-center w-full gap-4">
      {/* Khung Canvas dọc 9:16 */}
      <div className="relative rounded-2xl overflow-hidden border border-indigo-500/30 shadow-2xl bg-slate-950/80 aspect-[9/16] w-full max-w-[280px] sm:max-w-[320px]">
        <canvas 
          ref={canvasRef} 
          width={360} 
          height={640} 
          className="w-full h-full block object-contain"
        />
        
        {/* Lớp mờ Overlay khi đang Export Video */}
        {isExporting && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-center p-4">
            <span className="text-4xl animate-spin mb-4">⚙️</span>
            <h4 className="text-base font-bold text-indigo-400">Rendering Video...</h4>
            <p className="text-xs text-neutral-400 mt-1 max-w-[200px]">Recording canvas animation and audio. Please keep this tab active.</p>
            <div className="w-4/5 bg-slate-800 h-2.5 rounded-full overflow-hidden mt-4 border border-indigo-500/20">
              <div 
                className="bg-gradient-to-r from-teal-400 to-indigo-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <span className="text-xs text-indigo-300 font-bold mt-2">{exportProgress}%</span>
          </div>
        )}
      </div>

      {/* Điều khiển Audio ẩn & Progress Bar */}
      <div className="w-full max-w-[320px] bg-slate-900/60 border border-slate-800 p-3 rounded-xl flex flex-col gap-2">
        <audio 
          ref={audioRef} 
          src={podcastUrl} 
          crossOrigin="anonymous"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleAudioEnded}
          className="hidden"
        />

        {/* Thanh trượt tiến trình */}
        <div className="w-full flex items-center gap-2">
          <span className="text-[10px] text-neutral-400 font-mono">
            {audioRef.current ? Math.floor(audioRef.current.currentTime) : 0}s
          </span>
          <div 
            className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const width = rect.width;
              if (audioRef.current) {
                audioRef.current.currentTime = (clickX / width) * audioRef.current.duration;
              }
            }}
          >
            <div 
              className="bg-indigo-500 h-full rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-neutral-400 font-mono">
            {audioRef.current && !isNaN(audioRef.current.duration) ? Math.floor(audioRef.current.duration) : 0}s
          </span>
        </div>

        {/* Cụm nút Play/Pause và Export */}
        <div className="flex justify-between items-center gap-2 mt-1">
          <button 
            onClick={togglePlay}
            disabled={isExporting}
            className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
          >
            {isPlaying ? '⏸️ Pause' : '▶️ Play Demo'}
          </button>
          
          <button 
            onClick={handleExportVideo}
            disabled={isExporting}
            className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white"
          >
            🎬 Download Video
          </button>
        </div>
      </div>
    </div>
  );
};
