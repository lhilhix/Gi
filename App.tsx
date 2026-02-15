
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Prism from 'prismjs';
// Import common Prism components for highlighting
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';

import { 
  ModelId, 
  Message, 
  ChatSession, 
  GroundingLink 
} from './types';
import { geminiService, ProviderKeys, LocationData } from './services/gemini';
import { 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  Cpu, 
  ImageIcon, 
  Search, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Loader2, 
  Paperclip, 
  ExternalLink, 
  PanelLeft, 
  ChevronDown, 
  Check,
  Zap,
  Activity,
  Settings,
  X,
  AlertTriangle,
  MapPin,
  Compass,
  HelpCircle,
  Moon,
  Sun,
  Copy,
  CheckCircle2
} from './components/Icons';

const MODELS = [
  // Google Group
  { id: ModelId.GEMINI_3_FLASH, name: 'Gemini 3 Flash', icon: <Sparkles className="w-4 h-4" />, desc: 'Fast & Efficient', provider: 'google', color: 'indigo' },
  { id: ModelId.GEMINI_3_PRO, name: 'Gemini 3 Pro', icon: <Cpu className="w-4 h-4" />, desc: 'Power & Logic', provider: 'google', color: 'indigo' },
  { id: ModelId.GEMINI_2_5_FLASH, name: 'Gemini 2.5 Flash', icon: <Compass className="w-4 h-4" />, desc: 'Maps & Grounding', provider: 'google', color: 'indigo' },
  { id: ModelId.GEMINI_IMAGE, name: 'Gemini 2.5 Image', icon: <ImageIcon className="w-4 h-4" />, desc: 'Creative Vision', provider: 'google', color: 'indigo' },
  // Groq Group
  { id: ModelId.GROQ_LLAMA_3_3, name: 'Llama 3.3 70B', icon: <Zap className="w-4 h-4" />, desc: 'Ultra Fast Inference', provider: 'groq', color: 'orange' },
  // Cerebras Group
  { id: ModelId.CEREBRAS_LLAMA_3_1_70B, name: 'Llama 3.1 70B', icon: <Activity className="w-4 h-4" />, desc: 'Wafer-Scale Speed', provider: 'cerebras', color: 'emerald' },
  // Hugging Face Group
  { id: ModelId.HF_MISTRAL_7B, name: 'Mistral 7B', icon: <Bot className="w-4 h-4" />, desc: 'Versatile Open Model', provider: 'huggingface', color: 'yellow' },
  { id: ModelId.HF_LLAMA_3_8B, name: 'Llama 3 8B', icon: <Bot className="w-4 h-4" />, desc: 'Lightweight & Smart', provider: 'huggingface', color: 'yellow' },
];

type Theme = 'dark' | 'light';

// Component to render message content with robust code highlighting and copy feature
const ChatMessageContent = ({ content, isDark }: { content: string, isDark: boolean }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Split content by code blocks
  const parts = useMemo(() => content.split(/(```[\s\S]*?```)/g), [content]);

  return (
    <div className="space-y-4">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
          const lang = match?.[1]?.toLowerCase() || 'javascript';
          const code = match?.[2] || '';
          const blockId = `code-${index}`;

          // Highlight the code using Prism
          const grammar = Prism.languages[lang] || Prism.languages.javascript;
          const highlightedHtml = Prism.highlight(code, grammar, lang);

          return (
            <div key={index} className={`rounded-xl overflow-hidden border shadow-sm ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 border-slate-700'}`}>
              <div className={`flex items-center justify-between px-4 py-2 border-b text-[10px] font-bold uppercase tracking-widest ${isDark ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                <span>{lang}</span>
                <button 
                  onClick={() => copyToClipboard(code, blockId)}
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  {copiedId === blockId ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 overflow-x-auto custom-scrollbar">
                <code 
                  className={`text-xs sm:text-sm font-mono leading-relaxed language-${lang}`}
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              </pre>
            </div>
          );
        }
        return (
          <div key={index} className="whitespace-pre-wrap leading-relaxed">
            {part}
          </div>
        );
      })}
    </div>
  );
};

// Helper component to highlight search queries in text
const HighlightedText = ({ text, query }: { text: string, query: string }) => {
  if (!query.trim()) return <>{text}</>;
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <span key={i} className="search-highlight">{part}</span>
        ) : (
          part
        )
      )}
    </>
  );
};

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId>(ModelId.GEMINI_3_FLASH);
  const [inputValue, setInputValue] = useState('');
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as Theme) || 'dark';
  });
  const [useSearch, setUseSearch] = useState(false);
  const [useMaps, setUseMaps] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // API Keys state
  const [keys, setKeys] = useState<ProviderKeys>(() => {
    const saved = localStorage.getItem('provider_keys');
    return saved ? JSON.parse(saved) : { groq: '', cerebras: '', huggingface: '' };
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId]);
  const currentModel = useMemo(() => MODELS.find(m => m.id === selectedModel) || MODELS[0], [selectedModel]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, scrollToBottom]);

  useEffect(() => {
    localStorage.setItem('provider_keys', JSON.stringify(keys));
  }, [keys]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      document.body.style.backgroundColor = '#f8fafc';
      document.body.style.color = '#0f172a';
    } else {
      document.body.classList.remove('light-mode');
      document.body.style.backgroundColor = '#0f172a';
      document.body.style.color = '#f1f5f9';
    }
  }, [theme]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Location handling
  useEffect(() => {
    if (useMaps && !location) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          });
        },
        (err) => {
          console.error("Location error:", err);
        }
      );
    }
  }, [useMaps, location]);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
      lastModelId: selectedModel,
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setSidebarSearchQuery('');
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleManageGeminiKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputValue.trim() && !attachedImage) || isProcessing) return;

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      const newId = Date.now().toString();
      const newSession: ChatSession = {
        id: newId,
        title: inputValue.trim().substring(0, 30) || 'New Conversation',
        messages: [],
        createdAt: Date.now(),
        lastModelId: selectedModel,
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newId);
      currentSessionId = newId;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: Date.now(),
      imageUrl: attachedImage || undefined,
    };

    setSessions(prev => prev.map(s => 
      s.id === currentSessionId 
        ? { ...s, messages: [...s.messages, userMessage], title: s.messages.length === 0 ? userMessage.content.substring(0, 30) : s.title }
        : s
    ));

    const prompt = inputValue;
    const currentImage = attachedImage;
    setInputValue('');
    setAttachedImage(null);
    setIsProcessing(true);

    const assistantMsgId = (Date.now() + 1).toString();
    const assistantPlaceholder: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      modelId: selectedModel,
      provider: currentModel.provider as any,
      isStreaming: true,
    };

    setSessions(prev => prev.map(s => 
      s.id === currentSessionId ? { ...s, messages: [...s.messages, assistantPlaceholder] } : s
    ));

    try {
      if (selectedModel === ModelId.GEMINI_IMAGE) {
        const result = await geminiService.generateImage(prompt);
        setSessions(prev => prev.map(s => 
          s.id === currentSessionId ? {
            ...s,
            messages: s.messages.map(m => 
              m.id === assistantMsgId ? { 
                ...m, 
                content: result.description, 
                imageUrl: result.imageUrl, 
                isStreaming: false 
              } : m
            )
          } : s
        ));
      } else {
        const history = activeSession?.messages.map(m => ({
          role: m.role === 'user' ? 'user' as const : 'model' as const,
          parts: [{ text: m.content }]
        })) || [];

        await geminiService.sendMessageStream(
          selectedModel,
          history,
          prompt,
          (chunk) => {
            setSessions(prev => prev.map(s => 
              s.id === currentSessionId ? {
                ...s,
                messages: s.messages.map(m => 
                  m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m
                )
              } : s
            ));
          },
          (response) => {
            const links = geminiService.extractGroundingLinks(response);
            setSessions(prev => prev.map(s => 
              s.id === currentSessionId ? {
                ...s,
                messages: s.messages.map(m => 
                  m.id === assistantMsgId ? { ...m, groundingLinks: links, isStreaming: false } : m
                )
              } : s
            ));
          },
          { 
            useSearch: useSearch && currentModel.provider === 'google',
            useMaps: useMaps && currentModel.provider === 'google',
            location: useMaps ? location : undefined,
            keys: keys,
            provider: currentModel.provider
          }
        );
      }
    } catch (err: any) {
      console.error(err);
      let errorMessage = "Error: Something went wrong.";
      
      if (err.message === "API_KEY_NOT_FOUND") {
        errorMessage = "Error: Google API Key not found. Please click 'Manage Google Key' in Settings.";
      } else if (err.message === "MISSING_PROVIDER_KEY") {
        errorMessage = `Error: Missing API key for ${currentModel.provider}. Please update your settings.`;
      } else if (err.message === "CORS_OR_FORBIDDEN") {
        errorMessage = `Error (403): Access Forbidden. Note: Local browsers may block direct Groq/Cerebras requests due to CORS.`;
      } else if (err.message.includes("401") || err.message.toLowerCase().includes("unauthorized")) {
        errorMessage = "Error (401): Invalid API Key. Please check your credentials in Settings.";
      } else if (err.message.includes("404")) {
        errorMessage = `Error (404): Model "${selectedModel}" not found. The provider might have changed their model list.`;
      }
      
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId ? {
          ...s,
          messages: s.messages.map(m => 
            m.id === assistantMsgId ? { ...m, content: errorMessage, isStreaming: false } : m
          )
        } : s
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  // Explicitly type the result of the reduction for better inference
  const groupedModels = useMemo(() => MODELS.reduce((acc, model) => {
    const provider = model.provider;
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, typeof MODELS>), []);

  const filteredSessions = useMemo(() => sessions.filter(session => {
    const query = sidebarSearchQuery.toLowerCase();
    if (!query) return true;
    const titleMatch = session.title.toLowerCase().includes(query);
    const messageMatch = session.messages.some(msg => msg.content.toLowerCase().includes(query));
    return titleMatch || messageMatch;
  }), [sessions, sidebarSearchQuery]);

  // Helper to extract a relevant snippet from the message history for search display
  const getSearchSnippet = useCallback((session: ChatSession, query: string) => {
    if (!query) return null;
    const lowerQuery = query.toLowerCase();
    const matchingMessage = session.messages.find(m => m.content.toLowerCase().includes(lowerQuery));
    if (!matchingMessage) return null;

    const content = matchingMessage.content;
    const index = content.toLowerCase().indexOf(lowerQuery);
    const padding = 30;
    const start = Math.max(0, index - padding);
    const end = Math.min(content.length, index + lowerQuery.length + padding);
    
    let snippet = content.substring(start, end).replace(/\n/g, ' ');
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
    return snippet;
  }, []);

  const isDark = theme === 'dark';

  return (
    <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-300 ${isDark ? 'bg-[#0f172a] text-slate-100' : 'bg-[#f8fafc] text-slate-900'}`}>
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} flex-shrink-0 border-r transition-all duration-300 flex flex-col overflow-hidden relative z-30 shadow-2xl ${isDark ? 'bg-[#0b1120] border-slate-800/50' : 'bg-white border-slate-200'}`}>
        <div className={`p-4 flex flex-col gap-4 border-b ${isDark ? 'border-slate-800/30' : 'border-slate-100'}`}>
          <div className="flex items-center justify-between gap-2">
            <button 
              onClick={createNewSession}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 font-medium active:scale-[0.98]"
            >
              <Plus className="w-5 h-5" />
              <span className="whitespace-nowrap">New Chat</span>
            </button>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className={`p-3 rounded-xl transition-all lg:hidden ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <PanelLeft className="w-5 h-5" />
            </button>
          </div>

          <div className="relative group">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors group-focus-within:text-indigo-400 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            <input 
              type="text"
              value={sidebarSearchQuery}
              onChange={(e) => setSidebarSearchQuery(e.target.value)}
              placeholder="Search history..."
              className={`w-full border rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all ${
                isDark 
                ? 'bg-slate-900/60 border-slate-800/80 text-white placeholder:text-slate-600' 
                : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
              }`}
            />
            {sidebarSearchQuery && (
              <button 
                onClick={() => setSidebarSearchQuery('')}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-colors ${isDark ? 'text-slate-500 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1 py-4">
          {filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 opacity-40 text-center">
              <MessageSquare className="w-8 h-8 mb-2" />
              <p className="text-xs font-medium">
                {sidebarSearchQuery ? 'No results found' : 'Your chats will appear here'}
              </p>
            </div>
          ) : (
            filteredSessions.map(session => {
              const snippet = getSearchSnippet(session, sidebarSearchQuery);
              return (
                <div 
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                    activeSessionId === session.id 
                    ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/20 shadow-sm' 
                    : `border-transparent ${isDark ? 'hover:bg-slate-800/40 text-slate-400' : 'hover:bg-slate-50 text-slate-600'}`
                  }`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <MessageSquare className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate text-sm font-medium">
                        <HighlightedText text={session.title} query={sidebarSearchQuery} />
                      </span>
                    </div>
                    {snippet && (
                      <span className="text-[10px] opacity-60 truncate pl-6 italic font-normal">
                        <HighlightedText text={snippet} query={sidebarSearchQuery} />
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={(e) => deleteSession(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-1 ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className={`p-4 border-t ${isDark ? 'border-slate-800/50' : 'border-slate-100'}`}>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors font-medium text-sm ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Settings & Keys</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className={`h-16 flex-shrink-0 border-b z-20 px-4 flex items-center justify-between transition-colors ${isDark ? 'glass border-slate-800/50' : 'bg-white/80 border-slate-200'}`}>
          <div className="flex items-center gap-2">
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className={`p-2 rounded-lg transition-all mr-2 ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className={`text-lg font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent hidden xs:block`}>
              AI Hub Pro
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2 rounded-xl transition-all border ${isDark ? 'bg-slate-800 border-slate-700 text-yellow-400 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-indigo-600 hover:bg-slate-200'}`}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {currentModel.provider === 'google' && selectedModel !== ModelId.GEMINI_IMAGE && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setUseSearch(!useSearch)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight transition-all border ${useSearch ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 shadow-sm' : `${isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'} border-transparent`}`}
                  title="Google Search Grounding"
                >
                  <Search className="w-3 h-3" />
                  <span className="hidden lg:inline">Search</span>
                </button>
                <button 
                  onClick={() => setUseMaps(!useMaps)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight transition-all border ${useMaps ? 'bg-red-500/10 text-red-500 border-red-500/30 shadow-sm' : `${isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'} border-transparent`}`}
                  title="Google Maps Grounding"
                >
                  <MapPin className="w-3 h-3" />
                  <span className="hidden lg:inline">Maps</span>
                </button>
              </div>
            )}

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className={`flex items-center gap-3 px-3 sm:px-4 py-2 border rounded-xl transition-all group ${
                  isDark 
                  ? 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/50' 
                  : 'bg-white hover:bg-slate-50 border-slate-200'
                } shadow-sm`}
              >
                <div className={`${
                  currentModel.color === 'orange' ? 'text-orange-500' : 
                  currentModel.color === 'emerald' ? 'text-emerald-500' : 
                  currentModel.color === 'yellow' ? 'text-yellow-500' :
                  'text-indigo-500'
                }`}>
                  {currentModel.icon}
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{currentModel.name}</span>
                  <span className="text-[10px] text-slate-500 hidden xs:block capitalize">{currentModel.provider}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isModelDropdownOpen && (
                <div className={`absolute right-0 mt-2 w-80 border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 ${isDark ? 'bg-[#0b1120] border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="p-2 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {/* Fixed: Use explicit casting to ensure 'models' is identified as an array during iteration */}
                    {(Object.entries(groupedModels) as [string, typeof MODELS][]).map(([provider, models]) => (
                      <div key={provider}>
                        <div className="px-3 mb-1 mt-1">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">{provider}</span>
                        </div>
                        <div className="space-y-1">
                          {models.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                setSelectedModel(model.id);
                                setIsModelDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all group ${
                                selectedModel === model.id 
                                ? `${isDark ? 'bg-indigo-600/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}` 
                                : `${isDark ? 'hover:bg-slate-800/60 text-slate-400' : 'hover:bg-slate-50 text-slate-600'}`
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg transition-colors ${
                                  selectedModel === model.id ? 
                                  (model.provider === 'google' ? 'bg-indigo-600 text-white' : model.provider === 'groq' ? 'bg-orange-600 text-white' : model.provider === 'huggingface' ? 'bg-yellow-600 text-white' : 'bg-emerald-600 text-white') : 
                                  (isDark ? 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-800')
                                }`}>
                                  {model.icon}
                                </div>
                                <div className="flex flex-col items-start leading-tight text-left">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${selectedModel === model.id ? 'text-indigo-500' : (isDark ? 'text-slate-300' : 'text-slate-700')}`}>{model.name}</span>
                                  </div>
                                  <span className="text-[10px] text-slate-500 italic">{model.desc}</span>
                                </div>
                              </div>
                              {selectedModel === model.id && (
                                <Check className="w-4 h-4" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Chat Display */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-8 flex flex-col gap-6">
          {!activeSession || activeSession.messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 select-none">
              <Bot className="w-16 h-16 mb-6 text-indigo-500 animate-pulse" />
              <h2 className="text-2xl font-bold mb-2">Unified Intelligence Hub</h2>
              <p className="max-w-md text-slate-500 font-medium">
                Switch between world-class models instantly. Access real-time data with Google Search & Maps integration.
              </p>
            </div>
          ) : (
            activeSession.messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-4 max-w-4xl w-full mx-auto animate-in slide-in-from-bottom-2 duration-300 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-10 h-10 flex-shrink-0 rounded-2xl flex items-center justify-center shadow-md transition-colors ${
                  msg.role === 'user' ? 'bg-indigo-600 text-white' : 
                  msg.provider === 'groq' ? 'bg-orange-600 text-white' :
                  msg.provider === 'cerebras' ? 'bg-emerald-600 text-white' : 
                  msg.provider === 'huggingface' ? 'bg-yellow-600 text-white' :
                  (isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200')
                }`}>
                  {msg.role === 'user' ? <User className="w-5 h-5" /> : (
                    msg.provider === 'groq' ? <Zap className="w-5 h-5" /> :
                    msg.provider === 'cerebras' ? <Activity className="w-5 h-5" /> :
                    msg.provider === 'huggingface' ? <Bot className="w-5 h-5" /> :
                    <Bot className={`w-5 h-5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  )}
                </div>
                <div className={`flex flex-col gap-2 min-w-0 ${msg.role === 'user' ? 'items-end' : ''}`}>
                  <div className={`p-4 rounded-3xl text-sm shadow-sm transition-all duration-300 ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white' 
                    : (isDark ? 'bg-slate-800/40 border border-slate-700/50 text-slate-100' : 'bg-white border border-slate-200 text-slate-800')
                  }`}>
                    {msg.content ? (
                      <ChatMessageContent content={msg.content} isDark={isDark} />
                    ) : msg.isStreaming ? (
                      <div className="flex items-center gap-1.5 py-1 px-2">
                        <span className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s] ${msg.role === 'user' ? 'bg-white' : 'bg-indigo-500'}`} />
                        <span className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s] ${msg.role === 'user' ? 'bg-white' : 'bg-indigo-500'}`} />
                        <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${msg.role === 'user' ? 'bg-white' : 'bg-indigo-500'}`} />
                      </div>
                    ) : null}
                    
                    {msg.imageUrl && (
                      <div className={`mt-4 rounded-2xl overflow-hidden border max-w-md shadow-lg ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
                        <img src={msg.imageUrl} alt="AI output" className="w-full h-auto object-cover" />
                      </div>
                    )}
                  </div>

                  {msg.groundingLinks && msg.groundingLinks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.groundingLinks.map((link, idx) => (
                        <a 
                          key={idx} 
                          href={link.uri} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] transition-all hover:scale-105 shadow-sm ${
                            link.type === 'maps' 
                              ? 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-500' 
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-600'
                          }`}
                        >
                          {link.type === 'maps' ? <MapPin className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
                          <span className="max-w-[150px] truncate font-bold uppercase tracking-wider">{link.title}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 px-1">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {MODELS.find(m => m.id === msg.modelId)?.name || 'AI Assistant'}
                      </span>
                      {msg.provider === 'groq' && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-600 px-1.5 py-0.5 rounded bg-orange-600/10 uppercase tracking-tighter">
                          <Zap className="w-2 h-2" /> Speed Core
                        </span>
                      )}
                      {msg.provider === 'cerebras' && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 px-1.5 py-0.5 rounded bg-emerald-600/10 uppercase tracking-tighter">
                          <Activity className="w-2 h-2" /> Wafer Scale
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className={`p-4 border-t transition-all duration-300 z-10 ${isDark ? 'glass border-slate-800/50' : 'bg-white border-slate-200'}`}>
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-2">
            {attachedImage && (
              <div className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-indigo-500 shadow-xl group animate-in zoom-in-50 duration-200">
                <img src={attachedImage} className="w-full h-full object-cover" />
                <button type="button" onClick={() => setAttachedImage(null)} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Trash2 className="w-5 h-5 text-white" />
                </button>
              </div>
            )}
            
            <div className="relative group">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder={
                  selectedModel === ModelId.GEMINI_IMAGE ? "Describe image in detail..." : 
                  currentModel.provider === 'google' ? "Ask about places, news, or general info..." : 
                  `Chatting with ${currentModel.name}...`
                }
                className={`w-full border rounded-2xl py-4 pl-4 pr-32 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 resize-none custom-scrollbar transition-all min-h-[60px] max-h-48 text-sm ${
                  isDark 
                  ? 'bg-slate-900/80 border-slate-700/50 text-white placeholder:text-slate-600' 
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
                }`}
                rows={1}
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-1">
                {currentModel.provider === 'google' && (
                  <button type="button" onClick={() => fileInputRef.current?.click()} className={`p-2.5 rounded-xl transition-all ${isDark ? 'text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/10' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'}`} title="Attach Image">
                    <Paperclip className="w-5 h-5" />
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                  </button>
                )}
                <button 
                  type="submit" 
                  disabled={isProcessing || (!inputValue.trim() && !attachedImage)} 
                  className={`p-2.5 rounded-xl transition-all shadow-lg ${
                    isProcessing || (!inputValue.trim() && !attachedImage) 
                    ? 'text-slate-500 bg-slate-800 cursor-not-allowed opacity-50' 
                    : 'text-white bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20 active:scale-95'
                  }`}
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {useMaps && location && (
              <div className={`flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <MapPin className="w-2.5 h-2.5 text-red-500" />
                <span>LOCATION SYNCED: {location.latitude.toFixed(3)}N, {location.longitude.toFixed(3)}E</span>
              </div>
            )}
          </form>
        </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className={`w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border ${isDark ? 'bg-[#0b1120] border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className={`p-6 border-b flex items-center justify-between ${isDark ? 'border-slate-800 bg-slate-900/30' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex flex-col text-left">
                <h3 className={`text-xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  <Settings className="w-5 h-5 text-indigo-500" />
                  API Gateways
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Provider Credentials Setup</p>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className={`p-2 rounded-full transition-all ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-8">
                {/* Google Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <label className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>Google Generative AI</label>
                    <div className="group relative">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                      <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-2xl z-50 border leading-relaxed translate-y-2 group-hover:translate-y-0 text-[10px] ${
                        isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-600'
                      }`}>
                        Official Gemini API access. Selected via Google AI Studio platform key selector.
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={handleManageGeminiKey}
                    className="flex items-center justify-center gap-2 w-full p-4 bg-indigo-600/10 border border-indigo-500/30 text-indigo-600 rounded-2xl hover:bg-indigo-600/20 transition-all font-black uppercase tracking-[0.2em] text-[10px] active:scale-[0.98]"
                  >
                    <Bot className="w-4 h-4" />
                    Manage Key Selector
                  </button>
                </div>

                {/* Groq Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <label className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>Groq LPUs</label>
                  </div>
                  <div className="relative">
                    <input 
                      type="password"
                      value={keys.groq}
                      onChange={(e) => setKeys(prev => ({ ...prev, groq: e.target.value }))}
                      placeholder="Enter gsk_..."
                      className={`w-full border rounded-2xl px-5 py-4 text-sm outline-none transition-all font-mono ${
                        isDark 
                        ? 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-700 focus:ring-orange-500/20' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 focus:ring-orange-500/10'
                      }`}
                    />
                    <Zap className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500/20 pointer-events-none" />
                  </div>
                </div>

                {/* Cerebras Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <label className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>Cerebras CS-3</label>
                  </div>
                  <div className="relative">
                    <input 
                      type="password"
                      value={keys.cerebras}
                      onChange={(e) => setKeys(prev => ({ ...prev, cerebras: e.target.value }))}
                      placeholder="Enter csk_..."
                      className={`w-full border rounded-2xl px-5 py-4 text-sm outline-none transition-all font-mono ${
                        isDark 
                        ? 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-700 focus:ring-emerald-500/20' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 focus:ring-emerald-500/10'
                      }`}
                    />
                    <Activity className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/20 pointer-events-none" />
                  </div>
                </div>

                {/* Hugging Face Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <label className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-yellow-500' : 'text-yellow-600'}`}>Hugging Face</label>
                  </div>
                  <div className="relative">
                    <input 
                      type="password"
                      value={keys.huggingface}
                      onChange={(e) => setKeys(prev => ({ ...prev, huggingface: e.target.value }))}
                      placeholder="Enter hf_..."
                      className={`w-full border rounded-2xl px-5 py-4 text-sm outline-none transition-all font-mono ${
                        isDark 
                        ? 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-700 focus:ring-yellow-500/20' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 focus:ring-yellow-500/10'
                      }`}
                    />
                    <Bot className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-500/20 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className={`p-5 rounded-2xl border flex gap-4 ${isDark ? 'bg-slate-900/50 border-slate-800/50' : 'bg-slate-50 border-slate-200'}`}>
                <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                <p className="text-[10px] text-slate-500 leading-relaxed font-bold uppercase tracking-tighter text-left">
                  Credentials are persistent in your browser's local cache. Some providers require CORS-friendly environments or specific endpoint configurations.
                </p>
              </div>
            </div>

            <div className={`p-6 pt-0 ${isDark ? 'bg-slate-900/10' : 'bg-slate-50/50'}`}>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/30 active:scale-[0.97]"
              >
                Sync Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
