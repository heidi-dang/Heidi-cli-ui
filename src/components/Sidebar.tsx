import React, { useEffect, useState } from 'react';
import { RunSummary } from '../types';
import { api } from '../api/heidi';
import { RefreshCw, Settings, Circle, CheckCircle, XCircle, AlertTriangle, PanelLeft, User, Plus, History, ChevronRight, Sparkles, X, Layers, Coins } from 'lucide-react';

interface SidebarProps {
  currentView: 'chat' | 'settings' | 'gemini';
  onNavigate: (view: 'chat' | 'settings' | 'gemini') => void;
  onNewChat: () => void;
  onSelectRun: (runId: string) => void;
  selectedRunId: string | null;
  refreshTrigger: number;
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, onNewChat, onSelectRun, selectedRunId, refreshTrigger, isOpen, onToggle }) => {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchRuns = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.getRuns(15);
      setRuns(data);
    } catch (error) {
      console.warn("Failed to load history:", error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [refreshTrigger]);

  const getStatusIcon = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s === 'completed') return <CheckCircle size={14} className="text-emerald-400" />;
    if (s === 'failed' || s === 'cancelled') return <XCircle size={14} className="text-red-400" />;
    return <Circle size={14} className="text-purple-400 animate-pulse" />;
  };

  return (
    <div className="w-full flex flex-col h-full relative">
      {/* Header */}
      <div className="px-5 py-6 flex items-center justify-between gap-3 shrink-0">
        <div 
            className="flex items-center gap-3 group cursor-pointer" 
            onClick={() => { onNavigate('chat'); if(window.innerWidth < 1024) onToggle(); }}
        >
            <div className="w-10 h-10 relative flex-shrink-0 flex items-center justify-center bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-purple-900/20 p-[1px] group-hover:shadow-purple-900/40 transition-all duration-300 group-hover:scale-105">
                <div className="w-full h-full bg-[#0a0a0a] rounded-[11px] flex items-center justify-center overflow-hidden">
                     <img src="/heidiai_logo.png" alt="Heidi AI" className="w-full h-full object-cover opacity-90 group-hover:opacity-100" />
                </div>
            </div>
            <div className="flex flex-col">
                <span className="font-bold text-lg tracking-tight text-white leading-none mb-1 group-hover:text-purple-300 transition-colors">
                    Heidi AI
                </span>
                <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Assistant</span>
            </div>
        </div>
        
        {/* Mobile Close Button */}
        <button 
            onClick={onToggle}
            className="lg:hidden text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10 active:bg-white/20"
        >
            <X size={24} />
        </button>
      </div>

      {/* Main Actions */}
      <div className="px-3 pb-6 space-y-1 shrink-0 border-b border-white/5 mb-2">
        <button
          onClick={onNewChat}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group border ${
            currentView === 'chat' && !selectedRunId 
            ? 'bg-purple-600/10 border-purple-500/20 text-white shadow-lg shadow-purple-900/10' 
            : 'bg-white/5 border-transparent text-slate-300 hover:bg-white/10 hover:text-white hover:border-white/10'
          }`}
        >
          <div className={`p-1.5 rounded-lg transition-colors ${currentView === 'chat' && !selectedRunId ? 'bg-purple-500 text-white' : 'bg-white/10 text-slate-400 group-hover:text-white'}`}>
             <Plus size={16} strokeWidth={3} />
          </div>
          <span className="text-sm font-semibold">New Run</span>
        </button>
        
        <button
          onClick={() => onNavigate('gemini')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group border ${
            currentView === 'gemini'
            ? 'bg-indigo-600/10 border-indigo-500/20 text-white shadow-lg shadow-indigo-900/10' 
            : 'bg-transparent border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          <div className={`p-1.5 rounded-lg transition-colors ${currentView === 'gemini' ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-400 group-hover:text-white'}`}>
             <Sparkles size={16} />
          </div>
          <span className="text-sm font-semibold">Gemini Studio</span>
        </button>
      </div>

      {/* History Section */}
      <div className="flex-1 flex flex-col min-h-0 pt-2">
        <div className="px-6 pb-3 flex items-center justify-between text-slate-400 shrink-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <History size={12} />
                <span>Recent Activity</span>
            </div>
            <button 
                onClick={fetchRuns} 
                className={`hover:text-purple-300 transition-colors p-1.5 rounded-md hover:bg-white/5 ${loading ? 'animate-spin' : ''}`}
                title="Refresh history"
            >
                <RefreshCw size={12} />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 custom-scrollbar">
            {error ? (
                <div className="m-2 p-4 text-center bg-red-500/5 rounded-xl border border-red-500/10">
                    <AlertTriangle size={20} className="mx-auto text-red-400 mb-2" /> 
                    <p className="text-xs text-red-200 font-medium mb-2">Failed to load history</p>
                    <button 
                        onClick={fetchRuns}
                        className="text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-200 px-3 py-1.5 rounded border border-red-500/20 transition-colors font-bold"
                    >
                        Retry
                    </button>
                </div>
            ) : (
            <>
                {runs.map((run) => (
                <button
                    key={run.run_id}
                    onClick={() => onSelectRun(run.run_id)}
                    className={`w-full text-left p-3 rounded-xl transition-all duration-200 border group relative overflow-hidden mb-1 ${
                    selectedRunId === run.run_id
                        ? 'bg-white/[0.08] border-white/10 text-white shadow-md'
                        : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200 hover:border-white/5'
                    }`}
                >
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono opacity-50 bg-black/20 px-1.5 py-0.5 rounded border border-white/5">
                            #{run.run_id.substring(0, 5)}
                        </span>
                        {getStatusIcon(run.status)}
                    </div>
                    <div className="text-xs font-medium line-clamp-2 leading-relaxed opacity-90 pr-2 mb-1.5">
                        {run.task || run.executor || 'Untitled Run'}
                    </div>
                    
                    {/* Run Stats */}
                    {run.usage && (
                        <div className="flex items-center gap-3 mt-1 relative z-10 opacity-60 group-hover:opacity-100 transition-opacity">
                             <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                                <Layers size={10} className="text-purple-400" />
                                <span>{run.usage.total_tokens >= 1000 ? (run.usage.total_tokens/1000).toFixed(1) + 'k' : run.usage.total_tokens}</span>
                             </div>
                             {run.usage.cost_usd > 0 && (
                                <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                                    <Coins size={10} />
                                    <span>${run.usage.cost_usd.toFixed(4)}</span>
                                </div>
                             )}
                        </div>
                    )}
                    
                    {/* Hover Chevron */}
                    <div className={`absolute right-2 top-1/2 -translate-y-1/2 opacity-0 -translate-x-2 transition-all duration-300 ${selectedRunId === run.run_id ? 'opacity-100 translate-x-0 text-purple-400' : 'group-hover:opacity-100 group-hover:translate-x-0 text-slate-500'}`}>
                        <ChevronRight size={14} />
                    </div>
                </button>
                ))}
                
                {runs.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-600 gap-2">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                            <History size={20} className="opacity-20" />
                        </div>
                        <span className="text-xs">No run history yet</span>
                    </div>
                )}
            </>
            )}
        </div>
      </div>
      
      {/* Footer / Settings */}
      <div className="p-4 border-t border-white/5 mt-auto bg-black/20 shrink-0 space-y-2">
          <button
            onClick={() => onNavigate('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                currentView === 'settings' 
                ? 'bg-white/10 text-white' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
            >
            <Settings size={18} />
            <span className="text-sm font-medium">Settings</span>
          </button>
          
          <div className="flex items-center gap-3 w-full p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-inner shrink-0">
              <User size={14} />
            </div>
            <div className="flex flex-col items-start overflow-hidden min-w-0">
              <span className="text-xs font-bold text-slate-200 truncate w-full text-left">Local User</span>
              <span className="text-[10px] text-slate-500 truncate w-full">heidi-local</span>
            </div>
          </div>
      </div>
    </div>
  );
};

export default Sidebar;