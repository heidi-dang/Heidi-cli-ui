import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/heidi';
import { Agent, AppMode, RunEvent, RunStatus } from '../types';
import { 
  Send, Repeat, StopCircle, CheckCircle, AlertCircle, Loader2, PlayCircle, PanelLeft,
  Sparkles, Cpu, Map, Terminal, Eye, Shield, ArrowRight
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

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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
  }, [transcript, status]);

  useEffect(() => {
    return () => stopStreaming();
  }, []);

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
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
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
      setTranscript(details.events || []);
      setStatus(details.meta?.status || 'unknown');
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

    resetChat();
    setIsSending(true);
    setStatus('initiating');

    try {
      let response;
      if (mode === AppMode.RUN) {
        response = await api.startRun({ prompt, executor, workdir: null, dry_run: dryRun });
      } else {
        response = await api.startLoop({ task: prompt, executor, max_retries: maxRetries, workdir: null, dry_run: dryRun });
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

  const startStreaming = (id: string) => {
    stopStreaming(); 
    const streamUrl = api.getStreamUrl(id);
    try {
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setTranscript((prev) => [...prev, data]);
          if (data.type === 'status') setStatus(data.message); 
        } catch (e) { console.warn("Error parsing SSE data", event.data); }
      };
      es.onerror = () => { es.close(); startPolling(id); };
    } catch (e) { startPolling(id); }
  };

  const startPolling = (id: string) => {
    if (pollingRef.current) return;
    const check = async () => {
      try {
        const details = await api.getRun(id);
        if (details.events) setTranscript(details.events);
        setStatus(details.meta?.status || 'unknown');
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
    let icon = <Loader2 size={14} className="animate-spin text-purple-400" />;
    let label = rawStatus;

    if (s === 'completed') {
      color = "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20";
      icon = <CheckCircle size={14} />;
    } else if (s === 'failed' || s === 'error') {
      color = "bg-red-500/10 text-red-300 border border-red-500/20";
      icon = <AlertCircle size={14} />;
    } else if (s === 'idle') {
      color = "bg-white/5 text-slate-400 border border-white/10";
      icon = <div className="w-2 h-2 rounded-full bg-slate-500" />;
      label = "Idle";
    } else if (s.includes('cancel')) {
      color = "bg-orange-500/10 text-orange-300 border border-orange-500/20";
      icon = <StopCircle size={14} />;
    } else if (s.includes('initiating')) {
      color = "bg-blue-500/10 text-blue-300 border border-blue-500/20";
      icon = <Loader2 size={14} className="animate-spin" />;
      label = "Init...";
    } else {
      color = "bg-purple-500/10 text-purple-300 border border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]";
      if (s.includes('planning')) { label = "Planning"; icon = <Map size={14} />; }
      else if (s.includes('executing')) { label = "Executing"; icon = <Terminal size={14} />; }
      else if (s.includes('reviewing')) { label = "Reviewing"; icon = <Eye size={14} />; }
      else if (s.includes('auditing')) { label = "Auditing"; icon = <Shield size={14} />; }
      else { label = "Running"; icon = <Cpu size={14} className="animate-pulse" />; }
    }

    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider backdrop-blur-md transition-all duration-300 ${color}`}>
        {icon}
        <span className="truncate max-w-[120px]">{label}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-transparent overflow-hidden">
      
      {/* 1. Navbar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-white/5 bg-black/40 backdrop-blur-xl z-10 shrink-0">
        <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
           {!isSidebarOpen && (
               <button 
                onClick={onToggleSidebar} 
                className="text-slate-400 hover:text-white transition-colors p-2 -ml-2 rounded-lg hover:bg-white/5 active:scale-95 transform duration-100"
                aria-label="Toggle Sidebar"
               >
                   <PanelLeft size={20} />
               </button>
           )}
           <div className="flex flex-col min-w-0">
               {renderStatusBadge()}
           </div>
           {runId && <span className="hidden md:inline text-xs font-mono text-white/30 truncate">ID: {runId}</span>}
        </div>
      </div>

      {/* 2. Transcript */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6 scroll-smooth custom-scrollbar w-full max-w-5xl mx-auto">
        
        {/* User Bubble */}
        {(prompt || initialRunId) && (runId || transcript.length > 0) && (
            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="max-w-[85%] md:max-w-[70%] bg-gradient-to-br from-indigo-600 to-purple-700 text-white px-5 py-4 rounded-3xl rounded-tr-sm shadow-xl shadow-purple-900/10 border border-white/10">
                    <div className="text-[10px] text-indigo-200 mb-1 font-bold uppercase opacity-70 tracking-wide">
                        {mode === AppMode.LOOP ? 'Task' : 'Prompt'}
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">
                        {prompt || (transcript.find(e => e.type === 'user_prompt')?.message) || 'Run started...'}
                    </div>
                </div>
            </div>
        )}

        {/* Empty State */}
        {!runId && transcript.length === 0 && !isSending && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 pb-20 opacity-0 animate-in fade-in duration-700 delay-100 fill-mode-forwards">
             <div className="w-24 h-24 md:w-32 md:h-32 mb-6 relative group cursor-pointer">
                 <div className="absolute inset-0 bg-purple-500/30 blur-[60px] rounded-full group-hover:bg-purple-500/40 transition-all duration-700"></div>
                 <img src="/heidiai_logo.png" className="relative w-full h-full object-contain drop-shadow-2xl group-hover:scale-105 transition-transform duration-500" alt="Heidi AI" />
             </div>
            <h2 className="mt-4 text-2xl md:text-4xl font-bold text-white tracking-tight">How can I help you?</h2>
            <p className="text-slate-400 mt-3 text-sm md:text-base max-w-md">
                Select an agent, configure your mode, and start automating your tasks.
            </p>
          </div>
        )}

        {/* Events */}
        <div className="space-y-4">
            {transcript.map((event, idx) => {
                if (!event.message) return null;
                const isError = event.type === 'error';
                return (
                    <div key={idx} className="flex gap-3 md:gap-4 max-w-full md:max-w-[90%] animate-in fade-in slide-in-from-bottom-2 duration-300">
                         <div className="flex-shrink-0 mt-1 hidden md:block">
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shadow-lg ${isError ? 'bg-red-500/10 border-red-500/20' : 'bg-black/40 border-white/10'}`}>
                                 {isError ? <AlertCircle size={16} className="text-red-400"/> : <Sparkles size={16} className="text-purple-400" />}
                             </div>
                         </div>
                         <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2 mb-1.5 ml-1">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${isError ? 'text-red-400' : 'text-purple-300/80'}`}>{event.type || 'System'}</span>
                                <span className="text-[10px] text-slate-600 font-mono">{event.ts ? new Date(event.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</span>
                             </div>
                             
                             <div className={`text-sm leading-relaxed p-4 rounded-2xl rounded-tl-sm border shadow-sm backdrop-blur-sm overflow-x-auto ${
                                 isError ? 'bg-red-950/20 border-red-500/20 text-red-200' : 
                                 'bg-[#1a162e]/60 border-white/5 text-slate-200'
                             }`}>
                                 <pre className="whitespace-pre-wrap font-sans text-sm">{event.message}</pre>
                             </div>
                         </div>
                    </div>
                )
            })}
            
            {/* Thinking Loader */}
            {isRunActive && !status.includes('cancel') && (
                 <div className="flex gap-3 md:gap-4 max-w-full md:max-w-[90%] animate-pulse ml-0 md:ml-0">
                    <div className="w-8 h-8 flex-shrink-0 hidden md:block" />
                    <div className="flex items-center gap-2 text-purple-400/50 text-xs bg-purple-900/5 px-4 py-2 rounded-full border border-purple-500/5">
                        <Loader2 size={12} className="animate-spin" />
                        <span>Processing...</span>
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
                <div className="bg-black/40 border border-emerald-500/20 rounded-2xl p-5 md:p-6 font-mono text-sm text-emerald-100/90 overflow-x-auto shadow-2xl relative group">
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
                <div className="bg-red-950/20 border border-red-500/20 rounded-2xl p-5 md:p-6 font-mono text-sm text-red-200 shadow-xl">
                    {error}
                </div>
            </div>
        )}

        <div ref={chatBottomRef} className="h-4" />
      </div>

      {/* 3. Input Controls */}
      <div className="p-4 md:p-6 z-20 shrink-0">
        <div className={`max-w-4xl mx-auto transition-all duration-500 ${!isRunActive ? 'bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl' : 'bg-transparent border-none shadow-none'} rounded-3xl p-1.5 md:p-2`}>
            
            {/* Mode & Config Bar */}
            {!isRunActive && (
                <div className="flex flex-col md:flex-row md:items-center gap-3 px-2 pt-2 pb-3 md:pb-2">
                    {/* Toggle */}
                    <div className="flex bg-white/5 rounded-xl p-1 border border-white/5 self-start">
                        <button 
                            onClick={() => setMode(AppMode.RUN)}
                            className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${mode === AppMode.RUN ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            Run
                        </button>
                        <button 
                            onClick={() => setMode(AppMode.LOOP)}
                            className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${mode === AppMode.LOOP ? 'bg-pink-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            Loop
                        </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                         {/* Executor */}
                        <div className="relative group">
                            <select 
                                value={executor} 
                                onChange={(e) => setExecutor(e.target.value)}
                                className="appearance-none bg-black/40 border border-white/10 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-300 focus:border-purple-500 outline-none hover:bg-white/5 transition-colors cursor-pointer"
                            >
                                {agents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                            </select>
                            <Terminal size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        </div>

                        {/* Retries */}
                        {mode === AppMode.LOOP && (
                             <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 animate-in fade-in zoom-in-95">
                                <span className="text-[10px] uppercase font-bold text-slate-500">Retries</span>
                                <input 
                                    type="number" 
                                    min={0} 
                                    max={10} 
                                    value={maxRetries} 
                                    onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                                    className="w-8 bg-transparent text-center text-xs text-white focus:outline-none"
                                />
                            </div>
                        )}

                        <label className="flex items-center gap-2 cursor-pointer group bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 hover:border-purple-500/50 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={dryRun} 
                                onChange={(e) => setDryRun(e.target.checked)}
                                className="w-3 h-3 rounded bg-white/10 border-white/20 text-purple-500 focus:ring-0 cursor-pointer"
                            />
                            <span className="text-[10px] font-bold uppercase text-slate-400 group-hover:text-purple-300 transition-colors">Dry Run</span>
                        </label>
                    </div>
                </div>
            )}

            {/* Input Field */}
            <div className="relative group">
                <textarea
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
                    className={`w-full ${!isRunActive ? 'bg-white/5' : 'bg-black/40 border-white/10'} text-white placeholder-slate-500/60 rounded-2xl py-4 px-5 pr-16 focus:ring-2 focus:ring-purple-500/40 focus:bg-white/10 outline-none resize-none min-h-[60px] max-h-[160px] transition-all text-sm md:text-base leading-relaxed disabled:opacity-50`}
                    rows={1}
                />
                
                <div className="absolute right-2 bottom-2">
                    {isRunActive ? (
                        <button
                            onClick={handleStop} 
                            disabled={isCancelling}
                            className={`p-2.5 rounded-xl flex items-center gap-2 transition-all ${
                                isCancelling 
                                ? 'bg-orange-500/20 text-orange-400' 
                                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            }`}
                        >
                           {isCancelling ? <Loader2 size={20} className="animate-spin" /> : <StopCircle size={20} />}
                           <span className="text-xs font-bold uppercase hidden md:inline">Stop</span>
                        </button>
                    ) : (
                        <button
                            onClick={handleStart}
                            disabled={!prompt.trim() || isSending}
                            className={`p-2.5 rounded-xl flex items-center justify-center transition-all duration-300 shadow-lg ${
                                prompt.trim() && !isSending 
                                ? 'bg-white text-black hover:scale-105 hover:bg-purple-50' 
                                : 'bg-white/10 text-slate-500 cursor-not-allowed'
                            }`}
                        >
                            {isSending ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
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