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
  const gainNodeRef = useRef<GainNode | null>(null);

  // Tự động dọn dẹp và đóng AudioContext cũ khi đổi podcastUrl hoặc khi component unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch((e) => console.error("Error closing AudioContext:", e));
        audioCtxRef.current = null;
        sourceNodeRef.current = null;
        destNodeRef.current = null;
        gainNodeRef.current = null;
        console.log("✓ [VideoPlayer] Cleaned up AudioContext.");
      }
    };
  }, [podcastUrl]);

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
      let timing = sceneTimingsRef.current[0] || { start: 0, end: 3, duration: 3 };
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

      // 1. Vẽ Background Split-Screen
      gradientOffset += 0.0015;
      
      // Nửa trên (Rookie)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, 320);
      ctx.clip();
      const gradTop = ctx.createRadialGradient(
        canvas.width / 2 + Math.sin(gradientOffset) * 40,
        140 + Math.cos(gradientOffset * 1.5) * 40,
        10,
        canvas.width / 2,
        140,
        320
      );
      gradTop.addColorStop(0, '#13113c'); // deep warm indigo
      gradTop.addColorStop(1, '#020617'); // black slate
      ctx.fillStyle = gradTop;
      ctx.fill();
      ctx.restore();

      // Nửa dưới (Cynic)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 320, canvas.width, 320);
      ctx.clip();
      const gradBottom = ctx.createRadialGradient(
        canvas.width / 2 + Math.sin(gradientOffset) * 40,
        500 + Math.cos(gradientOffset * 1.5) * 40,
        10,
        canvas.width / 2,
        500,
        320
      );
      gradBottom.addColorStop(0, '#24140b'); // deep amber
      gradBottom.addColorStop(1, '#020617'); // black slate
      ctx.fillStyle = gradBottom;
      ctx.fill();
      ctx.restore();

      // Vẽ lưới trang trí nhẹ
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.04)';
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

      // 2. Vẽ dải phân cách và sóng âm Spectrum động ở giữa
      const waveY = 320;
      const isHostTalking = isRookieTalking || isCynicTalking;
      const maxAmp = isHostTalking ? 45 : 3;
      const barCount = 36;
      const barWidth = 5;
      const gap = 4;
      const totalWidth = barCount * (barWidth + gap) - gap;
      const startX = (canvas.width - totalWidth) / 2;

      ctx.save();
      for (let i = 0; i < barCount; i++) {
        const timeFactor = Date.now() * 0.0075;
        const sineValue = Math.sin(timeFactor + i * 0.4) * Math.cos(timeFactor * 0.5 + i * 0.1);
        const amp = maxAmp * (0.2 + 0.8 * Math.abs(sineValue));
        const x = startX + i * (barWidth + gap);
        
        const barGrad = ctx.createLinearGradient(x, waveY - amp, x, waveY + amp);
        barGrad.addColorStop(0, '#2dd4bf'); // teal
        barGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.8)'); // purple
        barGrad.addColorStop(1, '#fb923c'); // orange

        ctx.fillStyle = barGrad;
        ctx.beginPath();
        ctx.roundRect(x, waveY - amp, barWidth, amp * 2, 2.5);
        ctx.fill();
      }
      
      // Đường line giữa
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, waveY);
      ctx.lineTo(canvas.width, waveY);
      ctx.stroke();
      ctx.restore();

      // 3. Vẽ Rookie (Phía trên)
      const rookieY = 140;
      const rookieRadius = 60;
      const rookieScale = isRookieTalking ? 1.05 + Math.sin(Date.now() * 0.015) * 0.02 : 1.0;
      
      ctx.save();
      if (isRookieTalking) {
        ctx.shadowColor = '#2dd4bf'; // teal glow
        ctx.shadowBlur = 18;
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
      
      try {
        ctx.drawImage(
          imgRookie, 
          canvas.width / 2 - rookieRadius * rookieScale, 
          rookieY - rookieRadius * rookieScale, 
          rookieRadius * 2 * rookieScale, 
          rookieRadius * 2 * rookieScale
        );
      } catch (e) {
        ctx.fillStyle = '#0d9488';
        ctx.fillRect(canvas.width / 2 - rookieRadius, rookieY - rookieRadius, rookieRadius * 2, rookieRadius * 2);
      }
      ctx.restore();

      // Nhãn Rookie ở trên cùng
      ctx.save();
      ctx.fillStyle = isRookieTalking ? '#2dd4bf' : 'rgba(255, 255, 255, 0.5)';
      ctx.font = 'bold 11px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ROOKIE', canvas.width / 2, rookieY - rookieRadius - 12);
      ctx.restore();

      // 4. Vẽ Cynic (Phía dưới)
      const cynicY = 500;
      const cynicRadius = 60;
      const cynicScale = isCynicTalking ? 1.05 + Math.sin(Date.now() * 0.015) * 0.02 : 1.0;
      
      ctx.save();
      if (isCynicTalking) {
        ctx.shadowColor = '#fb923c'; // orange glow
        ctx.shadowBlur = 18;
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

      // Nhãn Cynic ở dưới cùng
      ctx.save();
      ctx.fillStyle = isCynicTalking ? '#fb923c' : 'rgba(255, 255, 255, 0.5)';
      ctx.font = 'bold 11px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CYNIC', canvas.width / 2, cynicY + cynicRadius + 22);
      ctx.restore();

      // 5. Phụ đề Karaoke Pop in hoa dạng ngắn gọn (Y = 375, dưới dải sóng âm Y = 320)
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const upperText = activeScene.text.toUpperCase();
      const words = upperText.split(/\s+/);
      const textProgress = (currentTime - timing.start) / timing.duration;
      const clampedProgress = Math.min(Math.max(0, textProgress), 1);
      
      // Vị trí từ đang nói hiện tại trong toàn bộ câu
      const wordProgressLimit = Math.floor(words.length * clampedProgress);
      setActiveWordIndex(wordProgressLimit);
      
      // Chia mảng words thành các chunk con tối đa 4 từ
      const WORDS_PER_CHUNK = 4;
      const currentChunkIdx = Math.floor(wordProgressLimit / WORDS_PER_CHUNK);
      
      // Nhóm từ cần vẽ hiện tại
      const startIndex = currentChunkIdx * WORDS_PER_CHUNK;
      const chunkWords = words.slice(startIndex, startIndex + WORDS_PER_CHUNK);
      
      const centerY = 375; // Đặt dưới dải sóng âm Y = 320, trên đầu Cynic
      
      // Tính toán độ rộng của toàn bộ nhóm từ này để căn lề giữa chính xác
      let subTotalWidth = 0;
      const wordWidths: number[] = [];
      
      chunkWords.forEach((word, index) => {
        const globalIdx = startIndex + index;
        const isActive = globalIdx === wordProgressLimit;
        
        // Đo chiều rộng từ (từ active zoom to 20%)
        ctx.font = isActive 
          ? 'bold 24px "Impact", "Inter", sans-serif'
          : 'bold 20px "Impact", "Inter", sans-serif';
          
        const w = ctx.measureText(word + ' ').width;
        wordWidths.push(w);
        subTotalWidth += w;
      });
      
      let subStartX = (canvas.width - subTotalWidth) / 2;
      
      // Vẽ từng từ trong nhóm trực tiếp lên Canvas với viền đen dày
      chunkWords.forEach((word, index) => {
        const globalIdx = startIndex + index;
        const isActive = globalIdx === wordProgressLimit;
        const isPassed = globalIdx < wordProgressLimit;
        
        ctx.save();
        ctx.font = isActive 
          ? 'bold 24px "Impact", "Inter", sans-serif'
          : 'bold 20px "Impact", "Inter", sans-serif';
        
        // Vẽ viền đen dày nổi bật
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        
        const wordX = subStartX + wordWidths[index] / 2;
        ctx.strokeText(word, wordX, centerY);
        
        // Chọn màu sắc fill cho chữ
        if (isActive) {
          ctx.fillStyle = '#facc15'; // yellow neon
        } else if (isPassed) {
          ctx.fillStyle = activeScene.speaker === 'rookie' ? '#2dd4bf' : '#fb923c'; // highlight màu theo host
        } else {
          ctx.fillStyle = '#ffffff'; // màu trắng mặc định
        }
        
        ctx.fillText(word, wordX, centerY);
        ctx.restore();
        
        subStartX += wordWidths[index];
      });
      ctx.restore();

      // 6. Meme Pop-up & Fade-out ở vị trí động đối xứng (Không che phụ đề ở Y = 375)
      const sceneElapsed = currentTime - timing.start;
      if (sceneElapsed >= 0 && sceneElapsed <= 1.5) {
        const activeMemeId = activeScene.memeId;
        const memeImg = memeImages[activeMemeId];
        if (memeImg && memeImg.complete) {
          ctx.save();
          
          let memeScale = 1.0;
          let memeOpacity = 1.0;
          let translateY = 0;
          
          if (sceneElapsed < 0.25) {
            const progress = sceneElapsed / 0.25;
            memeScale = progress * 0.8 + 0.2;
            memeOpacity = progress;
            translateY = (1.0 - progress) * 25;
          } else if (sceneElapsed > 1.2) {
            const progress = (sceneElapsed - 1.2) / 0.3;
            memeOpacity = 1.0 - progress;
            translateY = progress * 25;
          }
          
          // Rookie nói -> Vẽ meme ở phía dưới (Y = 460). Cynic nói -> Vẽ meme ở phía trên (Y = 220).
          const memeCenterY = activeScene.speaker === 'rookie' ? 460 : 220;
          
          const speakFactor = (isRookieTalking || isCynicTalking) ? Math.sin(Date.now() * 0.01) * 0.02 : 0;
          ctx.globalAlpha = memeOpacity;
          ctx.translate(canvas.width / 2, memeCenterY + translateY);
          ctx.scale(memeScale + speakFactor, memeScale + speakFactor);

          // Khung Polaroid viền Neon
          ctx.shadowColor = activeScene.speaker === 'rookie' ? '#2dd4bf' : '#fb923c';
          ctx.shadowBlur = 20;
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = activeScene.speaker === 'rookie' ? '#2dd4bf' : '#fb923c';
          ctx.lineWidth = 3;

          const frameW = 190;
          const frameH = 135;
          ctx.beginPath();
          ctx.roundRect(-frameW / 2, -frameH / 2, frameW, frameH, 10);
          ctx.fill();
          ctx.stroke();

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(-frameW / 2 + 6, -frameH / 2 + 6, frameW - 12, frameH - 32, 6);
          ctx.clip();
          try {
            ctx.drawImage(memeImg, -frameW / 2 + 6, -frameH / 2 + 6, frameW - 12, frameH - 32);
          } catch (e) {}
          ctx.restore();

          ctx.fillStyle = '#94a3b8';
          ctx.font = 'bold 9px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowBlur = 0;
          ctx.fillText(activeMemeId.toUpperCase() + ' MODE', 0, frameH / 2 - 7);
          ctx.restore();
        }
      }

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

    // Đưa thời gian phát về đầu
    audio.currentTime = 0;

    // Khởi tạo AudioContext và các Node một lần duy nhất nếu chưa có
    if (!audioCtxRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioCtxRef.current = audioCtx;
        
        const sourceNode = audioCtx.createMediaElementSource(audio);
        sourceNodeRef.current = sourceNode;
        
        const destNode = audioCtx.createMediaStreamDestination();
        destNodeRef.current = destNode;
        
        const gainNode = audioCtx.createGain();
        gainNodeRef.current = gainNode;
        
        // Kết nối để thu âm vào MediaRecorder
        sourceNode.connect(destNode);
        
        // Kết nối để nghe loa ngoài (thông qua gainNode kiểm soát)
        sourceNode.connect(gainNode);
        gainNode.connect(audioCtx.destination);
      } catch (err) {
        console.error("AudioContext setup failed:", err);
      }
    }

    const audioCtx = audioCtxRef.current;
    const destNode = destNodeRef.current;

    // Tắt âm thanh phát ra loa ngoài qua GainNode để tránh tiếng ồn khi đang xuất video
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = 0.0;
    }

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
    if (destNode && destNode.stream.getAudioTracks().length > 0) {
      tracks.push(...destNode.stream.getAudioTracks());
    } else if (audioCtx) {
      // Fallback: Tạo một silent audio track nhân tạo nếu không tìm thấy track âm thanh
      console.warn("⚠️ [VideoPlayer] No active audio tracks found in destination node, creating synthetic silent track.");
      try {
        const osc = audioCtx.createOscillator();
        const silentDest = audioCtx.createMediaStreamDestination();
        osc.connect(silentDest);
        const silentTrack = silentDest.stream.getAudioTracks()[0];
        if (silentTrack) {
          tracks.push(silentTrack);
        }
      } catch (err) {
        console.error("Failed to create synthetic silent audio track:", err);
      }
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
      // Bật lại loa ngoài khi hoàn tất
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = 1.0;
      }
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
