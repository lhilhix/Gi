
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ModelId, 
  Message, 
  ChatSession, 
  GroundingLink 
} from './types';
import { geminiService } from './services/gemini';
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
  ExternalLink
} from './components/Icons';

const MODELS = [
  { id: ModelId.GEMINI_3_FLASH, name: 'Gemini 3 Flash', icon: <Sparkles className="w-4 h-4" />, desc: 'Fast & Efficient' },
  { id: ModelId.GEMINI_3_PRO, name: 'Gemini 3 Pro', icon: <Cpu className="w-4 h-4" />, desc: 'Power & Logic' },
  { id: ModelId.GEMINI_IMAGE, name: 'Gemini Image', icon: <ImageIcon className="w-4 h-4" />, desc: 'Creative Vision' },
];

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId>(ModelId.GEMINI_3_FLASH);
  const [inputValue, setInputValue] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [useSearch, setUseSearch] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, scrollToBottom]);

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

        // Add user image if exists to parts
        const currentParts: any[] = [{ text: prompt }];
        if (currentImage) {
          const base64Data = currentImage.split(',')[1];
          const mimeType = currentImage.split(';')[0].split(':')[1];
          currentParts.push({ inlineData: { data: base64Data, mimeType } });
        }

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
          { useSearch }
        );
      }
    } catch (err) {
      console.error(err);
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId ? {
          ...s,
          messages: s.messages.map(m => 
            m.id === assistantMsgId ? { ...m, content: "Sorry, I encountered an error while processing your request.", isStreaming: false } : m
          )
        } : s
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} flex-shrink-0 bg-[#0b1120] border-r border-slate-800/50 transition-all duration-300 flex flex-col overflow-hidden`}>
        <div className="p-4">
          <button 
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 font-medium"
          >
            <Plus className="w-5 h-5" />
            <span>New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1">
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${activeSessionId === session.id ? 'bg-slate-800/80 text-white shadow-inner' : 'hover:bg-slate-800/40 text-slate-400'}`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="truncate text-sm font-medium">{session.title}</span>
              </div>
              <button 
                onClick={(e) => deleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800/50">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/50">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold">
              U
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">Guest User</span>
              <span className="text-xs text-slate-500">Free Tier</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-16 flex-shrink-0 border-b border-slate-800/50 glass z-20 px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors lg:hidden"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Gemini Hub
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {selectedModel !== ModelId.GEMINI_IMAGE && (
              <button 
                onClick={() => setUseSearch(!useSearch)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${useSearch ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800 text-slate-400 border border-transparent'}`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search Grounding</span>
              </button>
            )}
            <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
              {MODELS.map(model => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  title={model.desc}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedModel === model.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                >
                  {model.icon}
                  <span className="hidden sm:inline">{model.name}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Chat Display */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-8 flex flex-col gap-6">
          {!activeSession || activeSession.messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 select-none">
              <Bot className="w-16 h-16 mb-6 text-indigo-400 animate-pulse" />
              <h2 className="text-2xl font-semibold mb-2">How can I help you today?</h2>
              <p className="max-w-md text-slate-400">
                Choose a model and start chatting, generating images, or exploring with search grounding.
              </p>
            </div>
          ) : (
            activeSession.messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-4 max-w-4xl w-full mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center shadow-lg ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-slate-800 border border-slate-700'}`}>
                  {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5 text-indigo-400" />}
                </div>
                <div className={`flex flex-col gap-2 min-w-0 ${msg.role === 'user' ? 'items-end' : ''}`}>
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600/10 border border-indigo-500/20 text-indigo-50' : 'bg-slate-800/40 border border-slate-700/50'}`}>
                    {msg.content ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : msg.isStreaming ? (
                      <div className="flex items-center gap-1">
                        <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" />
                        <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    ) : null}
                    
                    {msg.imageUrl && (
                      <div className="mt-4 rounded-lg overflow-hidden border border-slate-700/50 max-w-md">
                        <img src={msg.imageUrl} alt="Generated or attached content" className="w-full h-auto object-cover" />
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
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 text-[10px] text-slate-300 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="max-w-[150px] truncate">{link.title}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {msg.modelId && (
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest px-1">
                      {MODELS.find(m => m.id === msg.modelId)?.name}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-slate-800/50 glass z-10">
          <form 
            onSubmit={handleSubmit}
            className="max-w-4xl mx-auto flex flex-col gap-2"
          >
            {attachedImage && (
              <div className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-indigo-500 shadow-xl group">
                <img src={attachedImage} className="w-full h-full object-cover" />
                <button 
                  type="button"
                  onClick={() => setAttachedImage(null)}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                >
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
                placeholder={selectedModel === ModelId.GEMINI_IMAGE ? "Describe the image you want to generate..." : "Type your message here..."}
                className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl py-4 pl-4 pr-32 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 resize-none custom-scrollbar transition-all min-h-[60px] max-h-48 text-sm"
                rows={1}
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-1">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleImageUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-xl transition-all"
                  title="Attach Image"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || (!inputValue.trim() && !attachedImage)}
                  className={`p-2.5 rounded-xl transition-all ${isProcessing || (!inputValue.trim() && !attachedImage) ? 'text-slate-600' : 'text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'}`}
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center px-2">
              <span className="text-[10px] text-slate-500 font-medium tracking-tight">
                Shift + Enter for new line • {selectedModel === ModelId.GEMINI_IMAGE ? 'Generates Images' : 'Generates Text & Analysis'}
              </span>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 opacity-60">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Gemini Live</span>
                </div>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
