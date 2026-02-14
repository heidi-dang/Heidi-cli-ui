import React, { useState, useEffect, useRef } from 'react';
import { api, getSettings } from '../api/heidi';
import { Agent, AppMode, RunEvent, RunStatus } from '../types';
import { 
  Send, StopCircle, CheckCircle, AlertCircle, Loader2, PanelLeft,
  Sparkles, Cpu, Map, Terminal, Eye, Shield, ArrowRight, CornerDownLeft, Clock
} from 'lucide-react';

interface ChatProps {
  initialRunId?: string | null;
  onRunCreated?: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const Chat: React.FC<ChatProps> = ({ initialRunId, onRunCreated, isSidebarOpen, onToggleSidebar }) => {
  // Config State
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<AppMode>(AppMode.RUN); 
  const [executor, setExecutor] = useState('copilot');
  const [maxRetries, setMaxRetries] = useState(2);
  const [dryRun, setDryRun] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  // Runtime State
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [transcript, setTranscript] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const isRunActive = !!runId && !['completed', 'failed', 'cancelled', 'idle'].includes(status.toLowerCase());

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Initialization ---
  useEffect(() => {
    api.getAgents().then(setAgents).catch(() => {
      setAgents([{ name: 'copilot', description: 'Default executor' }]);
    });
  }, []);

  useEffect(() => {
    if (initialRunId && initialRunId !== runId) {
      loadRun(initialRunId);
    } else if (!initialRunId) {
      resetChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRunId]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, status, isSending]);

  useEffect(() => {
    return () => stopStreaming();
  }, []);

  // Resize textarea
  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [prompt]);

  // --- Logic ---
  const resetChat = () => {
    stopStreaming();
    setRunId(null);
    setTranscript([]);
    setStatus('idle');
    setResult(null);
    setError(null);
    setPrompt('');
    setIsCancelling(false);
  };

  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const loadRun = async (id: string) => {
    stopStreaming();
    setRunId(id);
    setTranscript([]); 
    setError(null);
    setResult(null);

    try {
      const details = await api.getRun(id);
      
      // Merge meta prompt into events if missing for consistent display
      let events = details.events || [];
      const userMsg = details.meta?.prompt || details.meta?.task;
      const hasUserPromptEvent = events.some(e => e.type === 'user_prompt');
      
      if (userMsg && !hasUserPromptEvent) {
          events = [{
              type: 'user_prompt',
              message: userMsg,
              ts: details.meta?.created_at || new Date().toISOString()
          }, ...events];
      }

      setTranscript(events);
      setStatus(details.meta?.status || RunStatus.RUNNING);
      setMode(details.meta?.task ? AppMode.LOOP : AppMode.RUN);
      setExecutor(details.meta?.executor || 'copilot');
      if (details.result) setResult(details.result);
      if (details.error) setError(details.error);

      if (
        details.meta?.status !== RunStatus.COMPLETED &&
        details.meta?.status !== RunStatus.FAILED &&
        details.meta?.status !== RunStatus.CANCELLED
      ) {
        startStreaming(id);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load run details');
    }
  };

  const handleStart = async () => {
    if (!prompt.trim()) return;

    const currentPrompt = prompt;
    resetChat();
    
    // Add user prompt to transcript immediately so it shows in the list
    setTranscript([{
        type: 'user_prompt',
        message: currentPrompt,
        ts: new Date().toISOString()
    }]);

    setIsSending(true);
    setStatus('initiating');

    try {
      let response;
      if (mode === AppMode.RUN) {
        response = await api.startRun({ prompt: currentPrompt, executor, workdir: null, dry_run: dryRun });
      } else {
        response = await api.startLoop({ task: currentPrompt, executor, max_retries: maxRetries, workdir: null, dry_run: dryRun });
      }

      setRunId(response.run_id);
      setStatus(RunStatus.RUNNING);
      
      if (onRunCreated) onRunCreated();
      startStreaming(response.run_id);
    } catch (err: any) {
      setError(err.message || 'Failed to start run');
      setStatus(RunStatus.FAILED);
    } finally {
      setIsSending(false);
    }
  };

  const handleStop = async () => {
      if (!runId) return;
      setIsCancelling(true);
      try {
          await api.cancelRun(runId);
          setStatus('cancelling');
      } catch (e) {
          console.error("Cancel failed", e);
      }
  };

  const startStreaming = async (id: string) => {
    stopStreaming();
    
    const { apiKey } = getSettings();
    const headers: HeadersInit = {};
    if (apiKey) {
        headers['X-Heidi-Key'] = apiKey;
    }

    const streamUrl = api.getStreamUrl(id);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(streamUrl, {
        headers,
        signal: controller.signal
      });
      
      if (!response.body) throw new Error("No response body");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // SSE messages are separated by double newline
        const parts = buffer.split('\n\n');
        // Keep the last part in buffer as it might be incomplete
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
               const jsonStr = trimmed.replace(/^data:\s?/, '');
               if (!jsonStr) continue;
               try {
                 const data = JSON.parse(jsonStr);
                 setTranscript((prev) => {
                    // Avoid duplicating user_prompt if backend sends it and we already added it locally
                    if (data.type === 'user_prompt') {
                        const exists = prev.some(e => e.type === 'user_prompt' && e.message === data.message);
                        if (exists) return prev;
                    }
                    return [...prev, data];
                 });
                 if (data.type === 'status') {
                   setStatus(data.message);
                 }
               } catch (e) {
                 console.warn("Error parsing SSE JSON chunk", jsonStr);
               }
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.warn("Streaming failed, switching to polling", e);
      startPolling(id);
    }
  };

  const startPolling = (id: string) => {
    if (pollingRef.current) return;
    const check = async () => {
      try {
        const details = await api.getRun(id);
        
        let events = details.events || [];
        const userMsg = details.meta?.prompt || details.meta?.task;
        const hasUserPromptEvent = events.some(e => e.type === 'user_prompt');
        if (userMsg && !hasUserPromptEvent) {
             events = [{
                type: 'user_prompt',
                message: userMsg,
                ts: details.meta?.created_at || new Date().toISOString()
            }, ...events];
        }

        setTranscript(events);
        setStatus(details.meta?.status || RunStatus.RUNNING);
        if (details.result) setResult(details.result);
        if (details.error) setError(details.error);
        const s = (details.meta?.status || '').toLowerCase();
        if (['completed', 'failed', 'cancelled'].includes(s)) {
          stopStreaming();
          setIsCancelling(false);
        }
      } catch (err) { console.error("Polling error", err); }
    };
    check();
    pollingRef.current = setInterval(check, 1000); 
  };

  // --- Visuals ---

  const renderStatusBadge = () => {
    const rawStatus = status || 'idle';
    const s = rawStatus.toLowerCase();
    
    let color = "bg-white/5 text-slate-400 border border-white/10";
    let icon = <div className="w-2 h-2 rounded-full bg-slate-500" />;
    let label = rawStatus;

    if (s === 'completed') {
      color = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      icon = <CheckCircle size={14} />;
    } else if (s === 'failed' || s === 'error') {
      color = "bg-red-500/10 text-red-400 border border-red-500/20";
      icon = <AlertCircle size={14} />;
    } else if (s === 'idle') {
      label = "Ready";
    } else if (s.includes('cancel')) {
      color = "bg-orange-500/10 text-orange-400 border border-orange-500/20";
      icon = <StopCircle size={14} />;
    } else if (s.includes('initiating')) {
      color = "bg-blue-500/10 text-blue-400 border border-blue-500/20";
      icon = <Loader2 size={14} className="animate-spin" />;
      label = "Init...";
    } else {
      color = "bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]";
      if (s.includes('planning')) { label = "Planning"; icon = <Map size={14} />; }
      else if (s.includes('executing')) { label = "Executing"; icon = <Terminal size={14} />; }
      else if (s.includes('reviewing')) { label = "Reviewing"; icon = <Eye size={14} />; }
      else if (s.includes('auditing')) { label = "Auditing"; icon = <Shield size={14} />; }
      else { label = "Running"; icon = <Cpu size={14} className="animate-pulse" />; }
    }

    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider backdrop-blur-md transition-all duration-300 ${color}`}>
        {icon}
        <span className="truncate max-w-[100px] sm:max-w-none">{label}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-transparent overflow-hidden">
      
      {/* 1. Navbar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl z-20 shrink-0 sticky top-0">
        <div className="flex items-center gap-3 overflow-hidden w-full">
           {!isSidebarOpen && (
               <button 
                onClick={onToggleSidebar} 
                className="lg:hidden text-slate-400 hover:text-white transition-colors p-2 -ml-2 rounded-lg hover:bg-white/5 active:bg-white/10"
                aria-label="Open Menu"
               >
                   <PanelLeft size={20} />
               </button>
           )}
           <div className="flex items-center gap-3 overflow-hidden">
               {renderStatusBadge()}
               {runId && (
                   <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-1 rounded-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                        {runId}
                   </span>
               )}
           </div>
        </div>
      </div>

      {/* 2. Transcript */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-8 scroll-smooth custom-scrollbar w-full max-w-4xl mx-auto">
        
        {/* Empty State */}
        {!runId && transcript.length === 0 && !isSending && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 pb-20 opacity-0 animate-in fade-in zoom-in duration-700 fill-mode-forwards">
             <div className="w-20 h-20 sm:w-24 sm:h-24 mb-6 relative group cursor-default">
                 <div className="absolute inset-0 bg-purple-500/20 blur-[40px] rounded-full group-hover:bg-purple-500/30 transition-all duration-700"></div>
                 <img src="/heidiai_logo.png" className="relative w-full h-full object-contain drop-shadow-2xl opacity-90 grayscale-[0.2]" alt="Heidi AI" />
             </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Heidi AI</h2>
            <p className="text-slate-400 mt-2 text-sm max-w-[280px] sm:max-w-md mx-auto leading-relaxed">
                Your autonomous agent for planning, executing, and auditing complex tasks.
            </p>
          </div>
        )}

        {/* Events */}
        <div className="space-y-6">
            {transcript.map((event, idx) => {
                if (!event.message) return null;
                
                // User Prompt styling (Inserted into transcript)
                if (event.type === 'user_prompt') {
                    return (
                        <div key={idx} className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="max-w-[85%] sm:max-w-[75%] bg-gradient-to-br from-[#2d2b42] to-[#1e1c2e] text-white px-5 py-4 rounded-2xl rounded-tr-sm shadow-xl shadow-black/20 border border-white/5">
                                <div className="text-[10px] text-indigo-300 mb-1.5 font-bold uppercase opacity-80 tracking-wider flex items-center gap-1.5">
                                    <div className="w-1 h-1 rounded-full bg-indigo-400"></div>
                                    {mode === AppMode.LOOP ? 'Objective' : 'Command'}
                                </div>
                                <div className="whitespace-pre-wrap leading-relaxed text-sm sm:text-base font-medium text-slate-100">
                                    {event.message}
                                </div>
                            </div>
                        </div>
                    );
                }

                const isError = event.type === 'error';
                return (
                    <div key={idx} className="flex gap-4 max-w-full sm:max-w-[90%] animate-in fade-in slide-in-from-bottom-2 duration-300 group">
                         <div className="flex-shrink-0 mt-1 hidden sm:block">
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${isError ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-white/5 border-white/5 text-purple-400 group-hover:border-purple-500/30 group-hover:bg-purple-500/10'}`}>
                                 {isError ? <AlertCircle size={16} /> : <Terminal size={16} />}
                             </div>
                         </div>
                         <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2 mb-2">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${isError ? 'text-red-400' : 'text-purple-300/80'}`}>{event.type || 'System'}</span>
                                <span className="text-[10px] text-slate-600 font-mono flex items-center gap-1">
                                    <Clock size={10} />
                                    {event.ts ? new Date(event.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : ''}
                                </span>
                             </div>
                             
                             <div className={`text-xs sm:text-sm leading-relaxed p-4 rounded-xl border shadow-sm overflow-x-auto custom-scrollbar font-mono ${
                                 isError ? 'bg-red-950/30 border-red-500/20 text-red-200' : 
                                 'bg-[#0a0a0a]/60 border-white/5 text-slate-300'
                             }`}>
                                 <pre className="whitespace-pre-wrap break-words">{event.message}</pre>
                             </div>
                         </div>
                    </div>
                )
            })}
            
            {/* Thinking Loader */}
            {isRunActive && !status.includes('cancel') && (
                 <div className="flex gap-4 max-w-full sm:max-w-[90%] animate-pulse ml-0">
                    <div className="w-8 h-8 flex-shrink-0 hidden sm:block" />
                    <div className="flex items-center gap-2 text-purple-400/70 text-xs bg-purple-500/5 px-4 py-2 rounded-full border border-purple-500/10">
                        <Loader2 size={12} className="animate-spin" />
                        <span className="font-mono tracking-tight">Processing stream...</span>
                    </div>
                </div>
            )}
        </div>

        {/* Results */}
        {result && (
            <div className="mt-8 border-t border-white/5 pt-8 animate-in fade-in zoom-in-95 duration-500 pb-10">
                <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2 text-xs uppercase tracking-wider">
                    <CheckCircle size={14} />
                    Final Output
                </h3>
                <div className="bg-[#050505] border border-emerald-500/20 rounded-2xl p-5 sm:p-6 font-mono text-sm text-emerald-100/90 overflow-x-auto shadow-2xl relative group custom-scrollbar">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50 rounded-l-xl transition-all group-hover:bg-emerald-400"></div>
                    <pre>{result}</pre>
                </div>
            </div>
        )}

        {error && (
            <div className="mt-8 border-t border-white/5 pt-8 pb-10">
                 <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2 text-xs uppercase tracking-wider">
                    <AlertCircle size={14} />
                    Execution Failed
                </h3>
                <div className="bg-red-950/20 border border-red-500/20 rounded-2xl p-5 sm:p-6 font-mono text-sm text-red-200 shadow-xl">
                    {error}
                </div>
            </div>
        )}

        <div ref={chatBottomRef} className="h-4" />
      </div>

      {/* 3. Input Controls */}
      <div className="p-4 sm:p-6 z-30 shrink-0 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent pt-10">
        <div className={`max-w-4xl mx-auto transition-all duration-300 ${!isRunActive ? 'bg-[#0f0f13]/90 backdrop-blur-xl border border-white/10 shadow-2xl' : 'bg-transparent border-none shadow-none'} rounded-3xl p-2`}>
            
            {/* Mode & Config Bar - Horizontal Scroll on Mobile */}
            {!isRunActive && (
                <div className="flex items-center gap-2 px-1 pt-1 pb-3 overflow-x-auto no-scrollbar mask-linear-fade">
                    {/* Toggle */}
                    <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/5 shrink-0">
                        <button 
                            onClick={() => setMode(AppMode.RUN)}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${mode === AppMode.RUN ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        >
                            Run
                        </button>
                        <button 
                            onClick={() => setMode(AppMode.LOOP)}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${mode === AppMode.LOOP ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        >
                            Loop
                        </button>
                    </div>

                    <div className="w-px h-6 bg-white/5 mx-1 shrink-0"></div>

                     {/* Executor */}
                    <div className="relative group shrink-0">
                        <select 
                            value={executor} 
                            onChange={(e) => setExecutor(e.target.value)}
                            className="appearance-none bg-white/5 border border-white/10 rounded-lg pl-2 pr-7 py-1.5 text-xs text-slate-300 focus:border-purple-500 outline-none hover:bg-white/10 transition-colors cursor-pointer font-medium"
                        >
                            {agents.map(a => <option key={a.name} value={a.name} className="bg-gray-900">{a.name}</option>)}
                        </select>
                        <Terminal size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>

                    {/* Retries */}
                    {mode === AppMode.LOOP && (
                         <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 shrink-0 animate-in fade-in zoom-in-95">
                            <span className="text-[10px] uppercase font-bold text-slate-500">Retries</span>
                            <input 
                                type="number" 
                                min={0} 
                                max={10} 
                                value={maxRetries} 
                                onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                                className="w-6 bg-transparent text-center text-xs text-white focus:outline-none font-bold"
                            />
                        </div>
                    )}

                    <label className="flex items-center gap-2 cursor-pointer group bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 hover:border-purple-500/50 transition-colors shrink-0">
                        <input 
                            type="checkbox" 
                            checked={dryRun} 
                            onChange={(e) => setDryRun(e.target.checked)}
                            className="w-3 h-3 rounded bg-white/10 border-white/20 text-purple-500 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-[10px] font-bold uppercase text-slate-400 group-hover:text-purple-300 transition-colors">Dry Run</span>
                    </label>
                </div>
            )}

            {/* Input Field */}
            <div className="relative group flex items-end gap-2">
                <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !isRunActive) {
                            e.preventDefault();
                            handleStart();
                        }
                    }}
                    placeholder={mode === AppMode.LOOP ? "Describe the task loop..." : "Enter a command or prompt..."}
                    disabled={isRunActive || isSending}
                    className={`w-full ${!isRunActive ? 'bg-transparent' : 'bg-[#0f0f13] border border-white/10 rounded-2xl'} text-white placeholder-slate-600 py-3 px-4 focus:bg-white/5 outline-none resize-none transition-all text-sm sm:text-base leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed max-h-[200px] overflow-y-auto custom-scrollbar`}
                    rows={1}
                />
                
                <div className="pb-1 pr-1">
                    {isRunActive ? (
                        <button
                            onClick={handleStop} 
                            disabled={isCancelling}
                            className={`p-3 rounded-xl flex items-center justify-center transition-all ${
                                isCancelling 
                                ? 'bg-orange-500/20 text-orange-400' 
                                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            }`}
                        >
                           {isCancelling ? <Loader2 size={20} className="animate-spin" /> : <StopCircle size={20} />}
                        </button>
                    ) : (
                        <button
                            onClick={handleStart}
                            disabled={!prompt.trim() || isSending}
                            className={`p-3 rounded-xl flex items-center justify-center transition-all duration-300 shadow-lg ${
                                prompt.trim() && !isSending 
                                ? 'bg-indigo-600 text-white hover:scale-105 hover:bg-indigo-500 shadow-indigo-900/20' 
                                : 'bg-white/5 text-slate-500 cursor-not-allowed'
                            }`}
                        >
                            {isSending ? <Loader2 size={20} className="animate-spin" /> : <CornerDownLeft size={20} />}
                        </button>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;