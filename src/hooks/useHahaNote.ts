import { useState, useEffect, useRef } from 'react';
import { HahaNoteScript, Scene, ChatMessage } from '../types';

const API_BASE = typeof window !== 'undefined'
  ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
     ? 'http://localhost:8081'
     : '')
  : '';

export const useHahaNote = () => {
  const [script, setScript] = useState<HahaNoteScript | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Trạng thái phát kịch bản
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Trạng thái chat nối tiếp
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeVoicesRef = useRef<{ rookie: string; cynic: string }>({ rookie: '', cynic: '' });

  // Dọn dẹp audio khi unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Tự động phát kịch bản (auto play) đồng bộ audio hoặc fallback setTimeout
  useEffect(() => {
    // Dừng audio và timer cũ nếu có trước khi chạy cảnh mới
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }

    if (!isPlaying || !script || playingIndex < 0 || playingIndex >= script.scenes.length) {
      return;
    }

    const currentScene = script.scenes[playingIndex];
    
    if (currentScene.audioUrl) {
      // Có audio lồng tiếng -> Phát audio và chuyển cảnh khi kết thúc audio
      const audioUrl = currentScene.audioUrl.startsWith('http') 
        ? currentScene.audioUrl 
        : `${API_BASE}${currentScene.audioUrl}`;
        
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      const handleEnded = () => {
        if (playingIndex < script.scenes.length - 1) {
          setPlayingIndex((prev) => prev + 1);
        } else {
          setIsPlaying(false);
          setPlayingIndex(-1); // Quay lại trạng thái ban đầu hoặc giữ nguyên câu cuối
        }
      };

      const handleError = (e: any) => {
        console.error("Audio playback error:", e);
        // Gặp lỗi tải/phát audio -> chuyển sang fallback dùng timer
        playTimerRef.current = setTimeout(() => {
          if (playingIndex < script.scenes.length - 1) {
            setPlayingIndex((prev) => prev + 1);
          } else {
            setIsPlaying(false);
          }
        }, 4500);
      };

      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);

      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      
      audio.play().catch((err) => {
        console.warn("Audio autoplay blocked or failed:", err);
        // Fallback dùng timer nếu trình duyệt chặn autoplay
        playTimerRef.current = setTimeout(() => {
          if (playingIndex < script.scenes.length - 1) {
            setPlayingIndex((prev) => prev + 1);
          } else {
            setIsPlaying(false);
          }
        }, 4500);
      });

      return () => {
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.pause();
      };
    } else {
      // Không có audio -> fallback dùng setTimeout như cũ
      playTimerRef.current = setTimeout(() => {
        if (playingIndex < script.scenes.length - 1) {
          setPlayingIndex((prev) => prev + 1);
        } else {
          setIsPlaying(false);
        }
      }, 4500);

      return () => {
        if (playTimerRef.current) {
          clearTimeout(playTimerRef.current);
        }
      };
    }
  }, [isPlaying, playingIndex, script]);

  const generateScript = async (
    input: string,
    category: string,
    topic: string,
    rookieVoice: string,
    cynicVoice: string
  ) => {
    setIsGenerating(true);
    setError(null);
    setScript(null);
    setPlayingIndex(-1);
    setIsPlaying(false);
    setChatMessages([]);
    
    activeVoicesRef.current = { rookie: rookieVoice, cynic: cynicVoice };
    
    try {
      const response = await fetch(`${API_BASE}/api/generate-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input, category, topic, rookieVoice, cynicVoice }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Không thể tạo kịch bản từ AI');
      }
      
      setScript({
        title: data.title,
        scenes: data.scenes,
        conversation_id: data.conversation_id
      });
      // Tự động nhảy vào câu đầu tiên
      setPlayingIndex(0);
      setIsPlaying(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Có lỗi xảy ra khi kết nối tới máy chủ');
    } finally {
      setIsGenerating(false);
    }
  };

  const parseChatReply = (reply: string): { sender: 'rookie' | 'cynic'; text: string }[] => {
    const lines = reply.split('\n');
    const parsed: { sender: 'rookie' | 'cynic'; text: string }[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[rookie]:')) {
        parsed.push({ sender: 'rookie', text: trimmed.replace('[rookie]:', '').trim() });
      } else if (trimmed.startsWith('[cynic]:')) {
        parsed.push({ sender: 'cynic', text: trimmed.replace('[cynic]:', '').trim() });
      } else if (trimmed.length > 0) {
        // Fallback nhãn
        const lastSender = parsed[parsed.length - 1]?.sender || 'cynic';
        parsed.push({ sender: lastSender, text: trimmed });
      }
    }
    
    // Nếu rỗng, fallback nguyên văn
    if (parsed.length === 0 && reply.trim().length > 0) {
      parsed.push({ sender: 'cynic', text: reply.trim() });
    }
    
    return parsed;
  };

  const sendChatMessage = async (text: string) => {
    if (!script?.conversation_id || !text.trim()) return;
    
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date()
    };
    
    setChatMessages((prev) => [...prev, userMsg]);
    setIsChatting(true);
    
    // Trích xuất lịch sử trò chuyện gửi kèm lên backend
    const historyPayload = chatMessages.map((msg) => ({
      sender: msg.sender,
      text: msg.text,
    }));

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text.trim(),
          conversation_id: script.conversation_id,
          rookieVoice: activeVoicesRef.current.rookie,
          cynicVoice: activeVoicesRef.current.cynic,
          history: historyPayload
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Không gửi được tin nhắn chat');
      }
      
      // Sử dụng chat_replies từ backend (đã kèm audioUrl) hoặc fallback parse tại client
      const replyParts = data.chat_replies || parseChatReply(data.reply).map(part => ({
        sender: part.sender,
        text: part.text,
        audioUrl: ''
      }));
      
      const newAiMessages: ChatMessage[] = replyParts.map((part: any, idx: number) => ({
        id: `ai-${Date.now()}-${idx}`,
        sender: part.sender,
        text: part.text,
        audioUrl: part.audioUrl,
        timestamp: new Date()
      }));
      
      setChatMessages((prev) => [...prev, ...newAiMessages]);
      
      // Nếu có thoại AI mới, cập nhật hiển thị câu thoại cuối cùng lên sân khấu ảo
      if (newAiMessages.length > 0) {
        const lastAiMsg = newAiMessages[newAiMessages.length - 1];
        // Đẩy câu thoại chat mới vào kịch bản hiển thị tạm thời trên Stage
        setScript((prevScript) => {
          if (!prevScript) return null;
          // Ánh xạ memeId ngẫu nhiên/hoặc mặc định cho câu thoại chat mới
          const guessedMeme = text.toLowerCase().includes('không') || text.toLowerCase().includes('sập') 
            ? 'burn' as const 
            : 'fine_dog' as const;
            
          const newScene: Scene = {
            speaker: lastAiMsg.sender as 'rookie' | 'cynic',
            text: lastAiMsg.text,
            memeId: guessedMeme,
            audioUrl: lastAiMsg.audioUrl
          };
          
          return {
            ...prevScript,
            scenes: [...prevScript.scenes, newScene]
          };
        });
        
        // Tự động chuyển Stage sang câu thoại mới nhất và tự phát âm thanh
        setTimeout(() => {
          setScript(prev => {
            if (prev) {
              setPlayingIndex(prev.scenes.length - 1);
              setIsPlaying(true);
            }
            return prev;
          });
        }, 100);
      }
    } catch (err: any) {
      console.error(err);
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'cynic',
        text: `[Hệ thống] Không thể tải phản hồi từ Gemini. Lỗi: ${err.message || 'Mất kết nối'}`,
        timestamp: new Date()
      };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsChatting(false);
    }
  };

  const playNext = () => {
    if (!script) return;
    if (playingIndex < script.scenes.length - 1) {
      setPlayingIndex((prev) => prev + 1);
    }
  };

  const playPrev = () => {
    if (playingIndex > 0) {
      setPlayingIndex((prev) => prev - 1);
    }
  };

  const togglePlay = () => {
    if (!script) return;
    if (playingIndex === -1 || playingIndex === script.scenes.length - 1) {
      setPlayingIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const resetPlayer = () => {
    setPlayingIndex(-1);
    setIsPlaying(false);
  };

  return {
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
    resetPlayer,
    setPlayingIndex,
    setIsPlaying
  };
};
