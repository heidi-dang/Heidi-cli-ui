import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, api } from '../api/heidi';
import { Save, Server, Wifi, AlertTriangle, PanelLeft, Lock, Globe } from 'lucide-react';

interface SettingsProps {
    isSidebarOpen: boolean;
    onToggleSidebar: () => void;
}

const Settings: React.FC<SettingsProps> = ({ isSidebarOpen, onToggleSidebar }) => {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const current = getSettings();
    setBaseUrl(current.baseUrl);
    setApiKey(current.apiKey);
    checkConnection(current.baseUrl, current.apiKey);
  }, []);

  const checkConnection = async (url: string, key: string) => {
    setStatus('checking');
    try {
      await api.health(url, key);
      setStatus('connected');
      setMsg('Connected successfully');
    } catch (error) {
      setStatus('error');
      setMsg('Connection failed');
    }
  };

  const handleSave = () => {
    saveSettings({ baseUrl, apiKey });
    checkConnection(baseUrl, apiKey);
  };

  return (
    <div className="h-full flex flex-col w-full bg-transparent">
       {/* Header */}
       <div className="px-4 md:px-6 py-4 flex items-center gap-4 bg-black/40 backdrop-blur-xl border-b border-white/5 shrink-0">
           {!isSidebarOpen && (
               <button 
                onClick={onToggleSidebar} 
                className="text-slate-400 hover:text-white transition-colors p-2 -ml-2 rounded-lg hover:bg-white/5 active:scale-95"
               >
                   <PanelLeft size={20} />
               </button>
           )}
           <h1 className="text-lg font-bold text-white tracking-tight">Configuration</h1>
       </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl border border-white/10">
                        <Server className="text-purple-300" size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Backend Settings</h2>
                        <p className="text-slate-400 text-sm">Configure your connection to Heidi Server</p>
                    </div>
                </div>

                <div className="bg-black/40 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl space-y-8">
                    
                    {/* Status Card */}
                    <div className={`p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-4 border transition-colors ${
                        status === 'connected' ? 'bg-emerald-500/5 border-emerald-500/20' :
                        status === 'error' ? 'bg-red-500/5 border-red-500/20' :
                        'bg-white/5 border-white/5'
                    }`}>
                        <div className={`p-3 rounded-xl shrink-0 ${
                            status === 'connected' ? 'bg-emerald-500/20 text-emerald-300' :
                            status === 'error' ? 'bg-red-500/20 text-red-300' :
                            'bg-white/10 text-slate-400'
                        }`}>
                            {status === 'checking' && <Wifi size={24} className="animate-pulse" />}
                            {status === 'connected' && <Wifi size={24} />}
                            {status === 'error' && <AlertTriangle size={24} />}
                            {status === 'idle' && <Server size={24} />}
                        </div>
                        
                        <div className="flex flex-col">
                            <span className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                                status === 'connected' ? 'text-emerald-400' : 
                                status === 'error' ? 'text-red-400' : 'text-slate-500'
                            }`}>
                                Connection Status
                            </span>
                            <span className="text-base font-medium text-white">
                                {status === 'idle' && "Ready to connect"}
                                {status === 'checking' && "Pinging server..."}
                                {status === 'connected' && "Backend Online"}
                                {status === 'error' && "Server Unreachable"}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="group">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide group-focus-within:text-purple-300 transition-colors">
                                <Globe size={12} /> Base URL
                            </label>
                            <input
                                type="text"
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                                placeholder="http://localhost:7777"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-white focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 outline-none transition-all placeholder-slate-600 font-mono text-sm shadow-inner"
                            />
                            <p className="mt-2 text-xs text-slate-500 pl-1">
                                Point to your local instance or Cloudflared tunnel URL.
                            </p>
                        </div>

                        <div className="group">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide group-focus-within:text-purple-300 transition-colors">
                                <Lock size={12} /> API Key
                            </label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-white focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 outline-none transition-all placeholder-slate-600 font-mono text-sm shadow-inner"
                            />
                            <p className="mt-2 text-xs text-slate-500 pl-1">
                                Optional. Sent via <code className="bg-white/10 px-1 rounded text-slate-300">X-Heidi-Key</code> header.
                            </p>
                        </div>
                    </div>

                    <div className="pt-6 flex flex-col-reverse sm:flex-row items-center justify-between gap-4 border-t border-white/5">
                        {msg && (
                            <span className={`text-sm font-medium px-3 py-1.5 rounded-lg w-full sm:w-auto text-center ${status === 'error' ? 'text-red-300 bg-red-500/10' : 'text-emerald-300 bg-emerald-500/10'}`}>
                                {msg}
                            </span>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={status === 'checking'}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-black hover:bg-purple-50 hover:scale-105 active:scale-95 px-8 py-3 rounded-xl font-bold shadow-lg shadow-purple-900/10 transition-all disabled:opacity-50 disabled:transform-none"
                        >
                            <Save size={18} />
                            Save & Connect
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default Settings;