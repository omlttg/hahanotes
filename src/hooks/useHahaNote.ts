import { useState, useEffect, useRef } from 'react';
import { HahaNoteScript, Scene, ChatMessage, SessionMetadata, HahaNotesConfig } from '../types';

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

  // Danh sách lịch sử chat & cấu hình cài đặt
  const [sessionsList, setSessionsList] = useState<SessionMetadata[]>([]);
  const [config, setConfig] = useState<HahaNotesConfig>({
    rookieVoice: "EXAVITQu4vr4xnSDxMaL", // Bella
    cynicVoice: "ErXwobaYiN019PkySvjV",  // Antoni (mặc định hoạt động)
    scenesCount: 5,
    enableBgm: true,
    enableSfx: true
  });

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

  // Khôi phục sessionsList & config & active session từ localStorage khi component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Tải config
        const savedConfig = localStorage.getItem('hahanotes_config');
        if (savedConfig) {
          setConfig(JSON.parse(savedConfig));
        }

        // Tải sessions list
        const savedList = localStorage.getItem('hahanotes_sessions_list');
        if (savedList) {
          setSessionsList(JSON.parse(savedList));
        }

        // Tải session hiện tại
        const savedActive = localStorage.getItem('hahanotes_session_v2');
        if (savedActive) {
          const parsed = JSON.parse(savedActive);
          if (parsed.script) {
            setScript(parsed.script);
          }
          if (parsed.chatMessages) {
            const msgs = parsed.chatMessages.map((m: any) => ({
              ...m,
              timestamp: new Date(m.timestamp)
            }));
            setChatMessages(msgs);
          }
          if (parsed.activeVoices) {
            activeVoicesRef.current = parsed.activeVoices;
          }
        }
      } catch (e) {
        console.error("Failed to load hahanotes history/config:", e);
      }
    }
  }, []);

  // Tự động lưu config khi config thay đổi
  const updateConfig = (newConfig: Partial<HahaNotesConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...newConfig };
      if (typeof window !== 'undefined') {
        localStorage.setItem('hahanotes_config', JSON.stringify(updated));
      }
      return updated;
    });
  };

  // Helper lưu session hiện tại
  const saveCurrentSessionHelper = (updatedScript: HahaNoteScript | null, updatedMessages: ChatMessage[]) => {
    if (typeof window !== 'undefined' && updatedScript?.conversation_id) {
      try {
        const sessionData = {
          script: updatedScript,
          chatMessages: updatedMessages,
          activeVoices: activeVoicesRef.current
        };
        localStorage.setItem('hahanotes_session_v2', JSON.stringify(sessionData));
        localStorage.setItem(
          `hahanotes_session_detail_${updatedScript.conversation_id}`,
          JSON.stringify(sessionData)
        );
      } catch (e) {
        console.error("Failed to save session detail:", e);
      }
    }
  };

  // Tự động phát kịch bản (auto play) đồng bộ audio hoặc fallback setTimeout
  useEffect(() => {
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

    const scene = script.scenes[playingIndex];
    const isRookie = scene.speaker === 'rookie';
    const voiceId = isRookie ? activeVoicesRef.current.rookie : activeVoicesRef.current.cynic;

    let sceneAudioUrl = scene.audioUrl;
    if (sceneAudioUrl && sceneAudioUrl.startsWith('/')) {
      sceneAudioUrl = `${API_BASE}${sceneAudioUrl}`;
    }
    
    // Fallback on-demand mapping nếu scene chưa có audioUrl
    if (!sceneAudioUrl) {
      const text = scene.text;
      let hash = 0;
      const combinedStr = `${voiceId}:${text}`;
      for (let i = 0; i < combinedStr.length; i++) {
        const char = combinedStr.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      const md5_hash = Math.abs(hash).toString(16);
      sceneAudioUrl = `${API_BASE}/api/audio-stream/${md5_hash}`;
    }

    if (sceneAudioUrl) {
      const audio = new Audio(sceneAudioUrl);
      audioRef.current = audio;

      const handleEnded = () => {
        if (playingIndex < script.scenes.length - 1) {
          setPlayingIndex((prev) => prev + 1);
        } else {
          setIsPlaying(false);
        }
      };

      const handleError = (e: any) => {
        console.warn("Audio tag error, falling back to timer:", e);
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

  // Sinh kịch bản mới
  const generateScript = async (
    input: string,
    category: string,
    topic: string,
    existingMessages: ChatMessage[] = []
  ) => {
    setIsGenerating(true);
    setError(null);
    setScript(null);
    setPlayingIndex(-1);
    setIsPlaying(false);
    
    // Ghi nhận giọng đọc đang dùng cho session này
    activeVoicesRef.current = { rookie: config.rookieVoice, cynic: config.cynicVoice };
    
    try {
      const response = await fetch(`${API_BASE}/api/generate-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          input, 
          category, 
          topic, 
          rookieVoice: config.rookieVoice, 
          cynicVoice: config.cynicVoice,
          scenesCount: config.scenesCount,
          enableBgm: config.enableBgm,
          enableSfx: config.enableSfx
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Không thể tạo kịch bản từ AI');
      }
      
      const newScript: HahaNoteScript = {
        title: data.title,
        scenes: data.scenes,
        conversation_id: data.conversation_id
      };

      setScript(newScript);
      setPlayingIndex(0);
      setIsPlaying(true);

      // Cập nhật tin nhắn
      const newAiIntro: ChatMessage = {
        id: `ai-intro-${Date.now()}`,
        sender: 'cynic' as const,
        text: `Rookie & Cynic wrote a comedy script titled "${data.title}"! Enjoy playing the show below.`,
        timestamp: new Date()
      };
      
      const updatedMessages = [...existingMessages, newAiIntro];
      setChatMessages(updatedMessages);

      // Thêm session mới vào danh sách lịch sử
      const newSession: SessionMetadata = {
        id: data.conversation_id,
        title: data.title || topic || input.slice(0, 25),
        category: category,
        createdAt: new Date().toISOString()
      };

      setSessionsList(prev => {
        const filtered = prev.filter(s => s.id !== data.conversation_id);
        const updated = [newSession, ...filtered];
        if (typeof window !== 'undefined') {
          localStorage.setItem('hahanotes_sessions_list', JSON.stringify(updated));
        }
        return updated;
      });

      // Lưu lại chi tiết session
      saveCurrentSessionHelper(newScript, updatedMessages);

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
        const lastSender = parsed[parsed.length - 1]?.sender || 'cynic';
        parsed.push({ sender: lastSender, text: trimmed });
      }
    }
    
    if (parsed.length === 0 && reply.trim().length > 0) {
      parsed.push({ sender: 'cynic', text: reply.trim() });
    }
    
    return parsed;
  };

  // Chat tiếp tục
  const sendChatMessage = async (text: string, existingMessages: ChatMessage[]) => {
    if (!script?.conversation_id || !text.trim()) return;
    
    setIsChatting(true);
    
    const historyPayload = existingMessages.map((msg) => ({
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
      
      const updatedMessages = [...existingMessages, ...newAiMessages];
      setChatMessages(updatedMessages);
      
      let finalScript = script;
      if (newAiMessages.length > 0) {
        const lastAiMsg = newAiMessages[newAiMessages.length - 1];
        const guessedMeme = text.toLowerCase().includes('không') || text.toLowerCase().includes('sập') 
          ? 'burn' as const 
          : 'fine_dog' as const;
          
        const newScene: Scene = {
          speaker: lastAiMsg.sender as 'rookie' | 'cynic',
          text: lastAiMsg.text,
          memeId: guessedMeme,
          audioUrl: lastAiMsg.audioUrl
        };
        
        finalScript = {
          ...script,
          scenes: [...script.scenes, newScene]
        };
        
        setScript(finalScript);
        
        // Nhảy tới câu thoại vừa chat để chạy tiếp karaoke/phát âm thanh
        setTimeout(() => {
          setPlayingIndex(finalScript.scenes.length - 1);
          setIsPlaying(true);
        }, 100);
      }

      // Lưu lại chi tiết session
      saveCurrentSessionHelper(finalScript, updatedMessages);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Có lỗi xảy ra khi chat');
    } finally {
      setIsChatting(false);
    }
  };

  // Khôi phục cuộc trò chuyện cũ từ lịch sử
  const loadSession = (sessionId: string) => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`hahanotes_session_detail_${sessionId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.script) {
            setScript(parsed.script);
            setPlayingIndex(-1);
            setIsPlaying(false);
          }
          if (parsed.chatMessages) {
            const msgs = parsed.chatMessages.map((m: any) => ({
              ...m,
              timestamp: new Date(m.timestamp)
            }));
            setChatMessages(msgs);
          }
          if (parsed.activeVoices) {
            activeVoicesRef.current = parsed.activeVoices;
          }
          // Lưu làm active session hiện tại
          localStorage.setItem('hahanotes_session_v2', saved);
        }
      } catch (e) {
        console.error("Failed to load session detail:", e);
      }
    }
  };

  // Xóa cuộc trò chuyện khỏi lịch sử
  const deleteSession = (sessionId: string) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(`hahanotes_session_detail_${sessionId}`);
        
        setSessionsList(prev => {
          const updated = prev.filter(s => s.id !== sessionId);
          localStorage.setItem('hahanotes_sessions_list', JSON.stringify(updated));
          return updated;
        });

        // Nếu là session đang active, reset luôn
        if (script?.conversation_id === sessionId) {
          resetSession();
        }
      } catch (e) {
        console.error("Failed to delete session:", e);
      }
    }
  };

  const playNext = () => {
    if (script && playingIndex < script.scenes.length - 1) {
      setPlayingIndex((prev) => prev + 1);
      setIsPlaying(true);
    }
  };

  const playPrev = () => {
    if (script && playingIndex > 0) {
      setPlayingIndex((prev) => prev - 1);
      setIsPlaying(true);
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

  const resetSession = () => {
    setScript(null);
    setChatMessages([]);
    setPlayingIndex(-1);
    setIsPlaying(false);
    activeVoicesRef.current = { rookie: '', cynic: '' };
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hahanotes_session_v2');
    }
  };

  return {
    script,
    isGenerating,
    isChatting,
    error,
    playingIndex,
    isPlaying,
    chatMessages,
    sessionsList,
    config,
    generateScript,
    sendChatMessage,
    playNext,
    playPrev,
    togglePlay,
    resetPlayer,
    resetSession,
    loadSession,
    deleteSession,
    updateConfig,
    setPlayingIndex,
    setIsPlaying,
    setChatMessages,
    setScript
  };
};
