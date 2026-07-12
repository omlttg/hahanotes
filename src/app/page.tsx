'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useHahaNote } from '../hooks/useHahaNote';
import { HahaNotesCard } from '../components/HahaNotesCard';
import { ChatMessage } from '../types';

type Category = 'destress' | 'learning' | 'news';

interface CategoryDetails {
  id: Category;
  title: string;
  emoji: string;
  desc: string;
  placeholder: string;
  color: string;
  borderColor: string;
  glowColor: string;
  activeColor: string;
  introMsg: string;
}

const CATEGORIES: CategoryDetails[] = [
  {
    id: 'destress',
    title: 'De-stress 🧘',
    emoji: '🧘',
    desc: 'Vent your corporate burnout, study struggles, or life dramas.',
    placeholder: 'Tell us what is stressing you out today (e.g., Working overtime with no pay, getting rejected by a crush...)',
    color: 'hover:bg-teal-500/10 hover:border-teal-500/30',
    borderColor: 'border-slate-800',
    glowColor: 'shadow-teal-500/5',
    activeColor: 'bg-teal-950/40 border-teal-500/40 text-teal-300',
    introMsg: "Hey there! Ready to vent out some frustration? Write down whatever is stressing you out, and Rookie & Cynic will roast it to make you laugh!"
  },
  {
    id: 'learning',
    title: 'Fun Learning 🎓',
    emoji: '🎓',
    desc: 'Submit any boring academic theories or coding syntax.',
    placeholder: 'Enter a topic you want to learn (e.g., Object-Oriented Programming, Quantum Physics, Stock Market...)',
    color: 'hover:bg-violet-500/10 hover:border-violet-500/30',
    borderColor: 'border-slate-800',
    glowColor: 'shadow-violet-500/5',
    activeColor: 'bg-violet-950/40 border-violet-500/40 text-violet-300',
    introMsg: "Welcome to Fun Learning! Enter any dry, boring concept or theory you're struggling to study, and we'll translate it into a hilarious dialogue."
  },
  {
    id: 'news',
    title: 'Hot News 🔥',
    emoji: '🔥',
    desc: 'Share a trending headline, celebrity drama, or social hot topic.',
    placeholder: 'Enter a news link or describe a trending drama (e.g., AI replacing software developers, billionaire boxing match...)',
    color: 'hover:bg-orange-500/10 hover:border-orange-500/30',
    borderColor: 'border-slate-800',
    glowColor: 'shadow-orange-500/5',
    activeColor: 'bg-orange-950/40 border-orange-500/40 text-orange-300',
    introMsg: "Breaking news! Drop a news headline or gossip here. Rookie & Cynic will give you the most sarcastic, hilarious talk-show review ever."
  }
];

const ROOKIE_VOICES = [
  { name: 'Bella (Default) 👩', id: 'EXAVITQu4vr4xnSDxMaL' },
  { name: 'Rachel 👩', id: '21m00Tcm4TlvDq8ikWAM' },
  { name: 'Emily 👩', id: 'LcfcDJNQAac5jaoGPBBSp' }
];

const CYNIC_VOICES = [
  { name: 'Antoni (Default) 👨', id: 'ErXwobaYiN019PkySvjV' },
  { name: 'Adam 👨', id: 'pNInz6obpgq5epa57xxT' },
  { name: 'Callum 👨', id: 'N2lVS1w4EtoT3nt4A4ex' }
];

export default function Home() {
  const {
    script,
    isGenerating,
    isChatting,
    error,
    chatMessages,
    sessionsList,
    config,
    generateScript,
    sendChatMessage,
    resetSession,
    loadSession,
    deleteSession,
    updateConfig,
    setChatMessages
  } = useHahaNote();

  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [inputText, setInputText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Khôi phục selectedCategory từ localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCat = localStorage.getItem('hahanotes_selected_category');
      if (savedCat) {
        setSelectedCategory(savedCat as Category);
      }
    }
  }, []);

  // Lưu selectedCategory vào localStorage khi thay đổi
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (selectedCategory) {
        localStorage.setItem('hahanotes_selected_category', selectedCategory);
      } else {
        localStorage.removeItem('hahanotes_selected_category');
      }
    }
  }, [selectedCategory]);

  // Cuộn xuống cuối khung chat khi có tin nhắn mới
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isGenerating, isChatting]);

  const activeCategory = CATEGORIES.find(c => c.id === selectedCategory);

  const handleSelectCategory = (catId: Category) => {
    setSelectedCategory(catId);
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return;

    resetSession(); // Làm sạch session hiện tại khi chọn category mới

    // Gửi tin nhắn chào mừng đặc trưng
    const userMsg: ChatMessage = {
      id: `user-select-${Date.now()}`,
      sender: 'user',
      text: `Let's do some ${cat.title}!`,
      timestamp: new Date()
    };

    const aiIntroMsg: ChatMessage = {
      id: `ai-intro-${Date.now()}`,
      sender: 'cynic',
      text: cat.introMsg,
      timestamp: new Date()
    };

    const initialMsgs = [userMsg, aiIntroMsg];
    setChatMessages(initialMsgs);

    // Lưu session nháp ban đầu vào localStorage để khôi phục khi F5
    if (typeof window !== 'undefined') {
      localStorage.setItem('hahanotes_session_v2', JSON.stringify({
        script: null,
        chatMessages: initialMsgs,
        activeVoices: { rookie: config.rookieVoice, cynic: config.cynicVoice }
      }));
    }

    setSidebarOpen(false);
  };

  const handleNewChat = () => {
    setSelectedCategory(null);
    setInputText('');
    resetSession();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hahanotes_selected_category');
    }
    setSidebarOpen(false);
  };

  const handleSelectHistory = (id: string, category: string) => {
    loadSession(id);
    setSelectedCategory(category as Category);
    setSidebarOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const query = inputText.trim();
    setInputText('');

    // Đẩy tin nhắn của User vào danh sách chat trước (hiển thị lập tức)
    const userMsg: ChatMessage = {
      id: `user-msg-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date()
    };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);

    if (!script) {
      // Lần đầu tiên: Sinh kịch bản
      await generateScript(query, activeCategory?.title || 'General', 'Default Topic', updatedMessages);
    } else {
      // Các lần sau: Chat tương tác tiếp tục
      await sendChatMessage(query, updatedMessages);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* SIDEBAR BÊN TRÁI - Điều Hướng Danh Mục, Lịch Sử Chat & Cài Đặt */}
      <aside 
        className={`fixed inset-y-0 left-0 w-[280px] bg-slate-900 border-r border-indigo-500/10 flex flex-col z-40 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } shrink-0`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-indigo-500/10 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleNewChat}>
            <span className="text-2xl animate-[pulse_2s_infinite]">🎙️</span>
            <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-300 via-violet-400 to-orange-400">
              HahaNotes
            </h1>
          </div>
          <button 
            className="md:hidden text-neutral-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <span>❌</span>
          </button>
        </div>

        {/* Nút New Chat */}
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full py-2.5 rounded-xl border border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-600/20 hover:border-indigo-500/60 transition-all text-sm font-semibold flex items-center justify-center gap-2"
          >
            <span>➕</span> New Show
          </button>
        </div>

        {/* Sidebar Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
          
          {/* SECTION 1: CHỌN DANH MỤC (CHANNELS) - Cập nhật theo yêu cầu của user */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2">
              Select Category 📺
            </h3>
            <div className="space-y-1">
              {CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleSelectCategory(cat.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs border text-left transition-all ${
                      isActive 
                        ? cat.activeColor 
                        : `border-transparent text-neutral-300 ${cat.color}`
                    }`}
                  >
                    <span className="text-lg">{cat.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold">{cat.title}</div>
                      <div className="text-[9px] text-neutral-400 truncate">{cat.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: SETTINGS (CÀI ĐẶT SHOW) */}
          <div className="space-y-3.5 border-t border-slate-800/80 pt-4 px-2">
            <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Show Settings ⚙️
            </h3>
            
            {/* Chọn giọng Rookie */}
            <div className="space-y-1">
              <label className="text-[9px] text-neutral-400 font-medium">Rookie Voice (Host 1)</label>
              <select
                value={config.rookieVoice}
                onChange={(e) => updateConfig({ rookieVoice: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500/50"
              >
                {ROOKIE_VOICES.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            {/* Chọn giọng Cynic */}
            <div className="space-y-1">
              <label className="text-[9px] text-neutral-400 font-medium">Cynic Voice (Host 2)</label>
              <select
                value={config.cynicVoice}
                onChange={(e) => updateConfig({ cynicVoice: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500/50"
              >
                {CYNIC_VOICES.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            {/* Số lượng câu thoại (Scenes Count) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[9px]">
                <label className="text-neutral-400 font-medium">Scenes count</label>
                <span className="text-indigo-400 font-bold">{config.scenesCount} scenes</span>
              </div>
              <input
                type="range"
                min="3"
                max="8"
                value={config.scenesCount}
                onChange={(e) => updateConfig({ scenesCount: parseInt(e.target.value) })}
                className="w-full accent-indigo-500 h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Bật tắt Sound Effects & Music */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-neutral-300">Background Music</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={config.enableBgm} 
                  onChange={(e) => updateConfig({ enableBgm: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-300 after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
              </label>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-neutral-300">Laughter SFX</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={config.enableSfx} 
                  onChange={(e) => updateConfig({ enableSfx: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-300 after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
              </label>
            </div>
          </div>

          {/* SECTION 3: RECENT CHATS (LỊCH SỬ CHAT) */}
          <div className="space-y-2 border-t border-slate-800/80 pt-4 px-2">
            <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Recent Shows 📜
            </h3>
            
            {sessionsList.length === 0 ? (
              <p className="text-[10px] text-neutral-500 italic py-2">
                No past shows yet. Write a prompt to save.
              </p>
            ) : (
              <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
                {sessionsList.map(s => (
                  <div
                    key={s.id}
                    className={`group w-full flex items-center justify-between text-left p-2 rounded-lg text-[11px] transition-all hover:bg-slate-800 cursor-pointer ${
                      script?.conversation_id === s.id ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500 font-semibold' : 'text-neutral-300'
                    }`}
                  >
                    <div 
                      onClick={() => handleSelectHistory(s.id, s.category)}
                      className="flex-1 truncate mr-2"
                    >
                      <span className="mr-1">🎙️</span>
                      <span className="truncate">{s.title}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-opacity p-0.5"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-indigo-500/10 text-center">
          <p className="text-[9px] text-neutral-500">HahaNotes v0.2.0 • Pro version</p>
        </div>
      </aside>

      {/* LỚP OVERLAY BẢO VỆ MOBILE khi sidebar mở */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/60 z-30 md:hidden backdrop-blur-sm"
        />
      )}

      {/* KHUNG CHAT CHÍNH BÊN PHẢI */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-gradient-to-b from-slate-950 to-slate-900/40">
        
        {/* Header Khung Chat */}
        <header className="h-[60px] bg-slate-900 border-b border-indigo-500/10 flex items-center justify-between px-4 md:px-6 z-10 shrink-0">
          <div className="flex items-center gap-3">
            {/* Nút Toggle Sidebar trên mobile */}
            <button 
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 text-neutral-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            >
              <span>☰</span>
            </button>

            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-300 to-indigo-400 cursor-pointer md:hidden" onClick={handleNewChat}>
              HahaNotes
            </span>
            
            {selectedCategory && (
              <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1 rounded-full border border-indigo-500/20">
                <span className="text-xs">{activeCategory?.emoji}</span>
                <span className="text-[11px] font-semibold text-indigo-400">
                  Channel: {activeCategory?.title}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {error && (
              <span className="text-[10px] text-red-400 font-bold bg-red-950/40 border border-red-500/20 px-2 py-0.5 rounded">
                API Error
              </span>
            )}
            <span className="text-[10px] text-neutral-500">
              ElevenLabs Adam/Bella
            </span>
          </div>
        </header>

        {/* Thân Chat & Tin nhắn */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 scrollbar-thin scrollbar-thumb-slate-800">
          
          {!selectedCategory ? (
            /* MÀN HÌNH HƯỚNG DẪN BAN ĐẦU KHI CHƯA CHỌN CATEGORY */
            <div className="flex-1 flex flex-col justify-center items-center text-center max-w-md mx-auto py-10">
              <span className="text-6xl mb-4 animate-[bounce_3s_infinite]">🎙️</span>
              <h2 className="text-2xl font-extrabold text-white mb-2 tracking-tight">
                Welcome to HahaNotes!
              </h2>
              <p className="text-xs md:text-sm text-neutral-400 leading-relaxed">
                Please select a <strong className="text-indigo-400">Category</strong> on the left sidebar to start your show. Rookie & Cynic are waiting to write dialogue and record viral videos!
              </p>
              
              {/* Chỉ báo hình ảnh đẹp */}
              <div className="mt-8 p-4 rounded-xl border border-indigo-500/10 bg-indigo-950/10 text-indigo-300 text-xs flex items-center gap-2 max-w-[280px]">
                <span>👈</span> Choose a category on the sidebar
              </div>
            </div>
          ) : (
            /* HIỂN THỊ CÁC TIN NHẮN CHAT CỦA CATEGORY */
            <div className="max-w-3xl w-full mx-auto flex flex-col gap-4">
              {chatMessages.map((msg) => {
                if (msg.sender === 'user') {
                  return (
                    <div key={msg.id} className="flex items-start gap-2.5 max-w-[85%] self-end flex-row-reverse">
                      <div className="w-8 h-8 rounded-full bg-indigo-950 border border-indigo-500/40 flex items-center justify-center text-[10px] font-bold text-indigo-300 shrink-0">
                        ME
                      </div>
                      <div className="bg-indigo-600 text-white p-3 rounded-2xl text-xs md:text-sm leading-relaxed shadow-md">
                        {msg.text}
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div key={msg.id} className="flex items-start gap-2.5 max-w-[85%]">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 border ${
                        msg.sender === 'rookie' 
                          ? 'bg-teal-950 border-teal-500/30 text-teal-300' 
                          : 'bg-orange-950 border-orange-500/30 text-orange-300'
                      }`}>
                        {msg.sender === 'rookie' ? 'RK' : 'CY'}
                      </div>
                      <div className={`p-3 rounded-2xl text-xs md:text-sm leading-relaxed shadow-sm border ${
                        msg.sender === 'rookie' 
                          ? 'bg-teal-950/20 border-teal-500/10 text-teal-100' 
                          : 'bg-orange-950/20 border-orange-500/10 text-orange-100'
                      }`}>
                        <span className="font-bold block text-[9px] uppercase tracking-wider mb-1">
                          {msg.sender === 'rookie' ? '🎙️ Rookie' : '🔥 Cynic'}
                        </span>
                        {msg.text}
                      </div>
                    </div>
                  );
                }
              })}

              {/* Thẻ HahaNotesCard (Podcast + Canvas Short Video) */}
              {script && (
                <div className="w-full my-2 animate-[pop-in_0.4s_ease-out_forwards]">
                  <HahaNotesCard 
                    script={script} 
                    rookieVoice={config.rookieVoice}
                    cynicVoice={config.cynicVoice}
                    enableBgm={config.enableBgm}
                    enableSfx={config.enableSfx}
                  />
                </div>
              )}
            </div>
          )}

          {/* Loading bong bóng chat cho AI */}
          {isGenerating && (
            <div className="max-w-3xl w-full mx-auto flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-900 border border-indigo-500/20 flex items-center justify-center text-sm shrink-0 animate-spin">
                ⚙️
              </div>
              <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-2xl text-xs text-indigo-300 font-medium flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                Rookie & Cynic are writing your comedy script...
              </div>
            </div>
          )}

          {isChatting && (
            <div className="max-w-3xl w-full mx-auto flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-900 border border-indigo-500/20 flex items-center justify-center text-sm shrink-0 animate-pulse">
                💬
              </div>
              <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-2xl text-xs text-indigo-300 font-medium flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                Hosts are replying...
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Hộp gõ Chat dưới cùng */}
        {selectedCategory && (
          <div className="p-4 bg-slate-900/80 border-t border-indigo-500/10 shrink-0">
            <form 
              onSubmit={handleSubmit}
              className="max-w-3xl w-full mx-auto flex gap-2 items-center"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isGenerating || isChatting}
                placeholder={
                  !script 
                    ? activeCategory?.placeholder 
                    : "Vent more, or chat with Rookie & Cynic..."
                }
                className="flex-1 bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs md:text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-neutral-500"
              />
              <button
                type="submit"
                disabled={isGenerating || isChatting || !inputText.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold p-3 rounded-xl transition-all flex items-center justify-center shrink-0"
              >
                <span>➡️</span>
              </button>
            </form>
          </div>
        )}
      </div>

    </div>
  );
}
