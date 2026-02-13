import React, { useEffect, useState } from 'react';
import { RunSummary } from '../types';
import { api } from '../api/heidi';
import { RefreshCw, Settings, MessageSquare, Circle, CheckCircle, XCircle, AlertTriangle, PanelLeft, User, Plus, Sparkles } from 'lucide-react';

interface SidebarProps {
  currentView: 'chat' | 'settings' | 'gemini';
  onNavigate: (view: 'chat' | 'settings' | 'gemini') => void;
  onSelectRun: (runId: string) => void;
  selectedRunId: string | null;
  refreshTrigger: number;
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, onSelectRun, selectedRunId, refreshTrigger, isOpen, onToggle }) => {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchRuns = async () => {
    setLoading(true);
    setError(false);
    try {
      // Req: GET /runs?limit=10
      const data = await api.getRuns(10);
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
    <div className="w-full flex flex-col h-full bg-black/40 backdrop-blur-md border-r border-white/5">
      {/* Header */}
      <div className="p-4 pt-5 pb-4 border-b border-white/5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden group cursor-pointer" onClick={() => onNavigate('chat')}>
            <div className="w-9 h-9 relative flex-shrink-0 flex items-center justify-center bg-gradient-to-tr from-pink-500 to-purple-600 rounded-xl shadow-lg shadow-purple-900/40 p-0.5 group-hover:shadow-pink-900/40 transition-shadow duration-500">
                <img src="/heidiai_logo.png" alt="Heidi AI" className="w-full h-full object-cover rounded-[10px]" />
            </div>
            <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight text-white leading-none mb-0.5">
                    Heidi AI
                </span>
                <span className="text-[10px] text-slate-400 font-medium tracking-wide">ASSISTANT</span>
            </div>
        </div>
        
        {/* Close Button (Visible on mobile only for logic, but UI demands consistency) */}
        <button 
            onClick={onToggle}
            className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5 md:hidden"
            title="Close Sidebar"
        >
            <PanelLeft size={18} />
        </button>
      </div>

      {/* Navigation */}
      <div className="p-3 space-y-1 shrink-0">
        <button
          onClick={() => onNavigate('chat')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
            currentView === 'chat' && !selectedRunId 
            ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-white border border-purple-500/20 shadow-sm' 
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
          }`}
        >
          <div className={`p-1.5 rounded-lg transition-colors ${currentView === 'chat' && !selectedRunId ? 'bg-purple-500/20 text-purple-300' : 'bg-white/5 text-slate-500 group-hover:text-slate-300'}`}>
             <Plus size={16} />
          </div>
          <span className="text-sm font-medium">New Chat</span>
        </button>
        
        <button
          onClick={() => onNavigate('gemini')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
            currentView === 'gemini' 
            ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-white border border-purple-500/20 shadow-sm' 
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
          }`}
        >
          <div className={`p-1.5 rounded-lg transition-colors ${currentView === 'gemini' ? 'bg-purple-500/20 text-purple-300' : 'bg-white/5 text-slate-500 group-hover:text-slate-300'}`}>
             <Sparkles size={16} />
          </div>
          <span className="text-sm font-medium">Gemini Studio</span>
        </button>

        <button
          onClick={() => onNavigate('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
            currentView === 'settings' 
            ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-white border border-purple-500/20 shadow-sm' 
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
          }`}
        >
          <div className={`p-1.5 rounded-lg transition-colors ${currentView === 'settings' ? 'bg-purple-500/20 text-purple-300' : 'bg-white/5 text-slate-500 group-hover:text-slate-300'}`}>
            <Settings size={16} />
          </div>
          <span className="text-sm font-medium">Settings</span>
        </button>
      </div>

      {/* History Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between text-slate-400 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500/80">Recent Runs</span>
            <button 
                onClick={fetchRuns} 
                className={`hover:text-purple-300 transition-colors p-1 rounded hover:bg-white/5 ${loading ? 'animate-spin' : ''}`}
                title="Refresh history"
            >
            <RefreshCw size={12} />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 custom-scrollbar">
            {error ? (
            <div className="px-2 py-6 text-center bg-red-500/5 rounded-xl border border-red-500/10 mx-2 animate-in fade-in zoom-in">
                <div className="flex justify-center mb-2 text-red-400/80">
                <AlertTriangle size={18} /> 
                </div>
                <p className="text-xs text-red-300 font-medium mb-2">Failed to load</p>
                <button 
                    onClick={fetchRuns}
                    className="text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-200 px-3 py-1.5 rounded border border-red-500/20 transition-colors font-medium"
                >
                    Retry Connection
                </button>
            </div>
            ) : (
            <>
                {runs.map((run) => (
                <button
                    key={run.run_id}
                    onClick={() => onSelectRun(run.run_id)}
                    className={`w-full text-left p-3 rounded-xl transition-all duration-200 border group relative overflow-hidden ${
                    selectedRunId === run.run_id
                        ? 'bg-white/[0.08] border-purple-500/30 text-white shadow-sm'
                        : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200 hover:border-white/5'
                    }`}
                >
                    <div className="flex items-center justify-between mb-1.5 relative z-10">
                    <span className="text-[10px] font-mono opacity-50 bg-white/5 px-1.5 py-0.5 rounded">
                        #{run.run_id.substring(0, 6)}
                    </span>
                    {getStatusIcon(run.status)}
                    </div>
                    <div className="text-xs font-medium line-clamp-2 leading-relaxed opacity-90 relative z-10 pr-2">
                        {run.task || run.executor || 'Untitled Run'}
                    </div>
                    {/* Active Indicator Bar */}
                    {selectedRunId === run.run_id && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-500 to-pink-500"></div>
                    )}
                </button>
                ))}
                {runs.length === 0 && !loading && (
                <div className="px-4 py-8 text-center text-slate-600 text-xs">
                    No run history found.
                </div>
                )}
            </>
            )}
        </div>
      </div>
      
      {/* Footer */}
      <div className="p-4 border-t border-white/5 mt-auto bg-black/20 shrink-0">
          <div className="flex items-center gap-3 w-full p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors cursor-default">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-inner">
              <User size={16} />
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