import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, api } from '../api/heidi';
import { OpenAIConnectionStatus, OpenAIConnectionTestResult } from '../types';
import { Save, Server, Wifi, AlertTriangle, PanelLeft, Lock, Globe, Bot, Link, ExternalLink, CheckCircle, XCircle, Loader2, X, Terminal, RefreshCw, Copy, Info, Key, ShieldAlert } from 'lucide-react';

interface SettingsProps {
    isSidebarOpen: boolean;
    onToggleSidebar: () => void;
}

const Settings: React.FC<SettingsProps> = ({ isSidebarOpen, onToggleSidebar }) => {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  
  // OpenAI Connection State
  const [openaiStatus, setOpenaiStatus] = useState<OpenAIConnectionStatus | null>(null);
  const [verifyingOpenai, setVerifyingOpenai] = useState(false);
  const [testingOpenai, setTestingOpenai] = useState(false);
  const [testResult, setTestResult] = useState<OpenAIConnectionTestResult | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    const current = getSettings();
    setBaseUrl(current.baseUrl);
    setApiKey(current.apiKey);
    
    // Initial checks
    checkConnection(current.baseUrl, current.apiKey);
    checkOpenAIStatus();
  }, []);

  const checkConnection = async (url: string, key: string) => {
    setStatus('checking');
    try {
      await api.health(url, key);
      setStatus('connected');
      setMsg('Connected successfully');
    } catch (error: any) {
      setStatus('error');
      setMsg(error.message || 'Connection failed');
    }
  };

  const checkOpenAIStatus = async () => {
      setVerifyingOpenai(true);
      try {
          const status = await api.getOpenAIStatus();
          setOpenaiStatus(status);
          // If status check clears error, also clear test result
          if(status.connected) {
              setTestResult(null);
          }
      } catch (e) {
          setOpenaiStatus({ connected: false, lastError: 'Check failed' });
      } finally {
          setVerifyingOpenai(false);
      }
  };

  const handleTestConnection = async () => {
      setTestingOpenai(true);
      setTestResult(null);
      try {
          const res = await api.testOpenAIConnection();
          setTestResult(res);
          // Refresh status to ensure consistency
          checkOpenAIStatus();
      } catch (e) {
          setTestResult({ pass: false, message: 'Test execution error' });
      } finally {
          setTestingOpenai(false);
      }
  };

  const handleSave = async () => {
    saveSettings({ baseUrl, apiKey });
    await checkConnection(baseUrl, apiKey);
  };
  
  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      setCopiedCmd(text);
      setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="h-full flex flex-col w-full bg-transparent relative">
       {/* Connect Modal */}
       {showConnectModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
               <div className="bg-[#1a1a20] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90vh]">
                   <button 
                    onClick={() => setShowConnectModal(false)}
                    className="absolute right-4 top-4 text-slate-400 hover:text-white z-10"
                   >
                       <X size={20} />
                   </button>
                   
                   <div className="p-6 border-b border-white/5 shrink-0">
                       <h3 className="text-xl font-bold text-white flex items-center gap-2">
                           <Bot size={24} className="text-emerald-400" />
                           Connect OpenAI (ChatGPT)
                       </h3>
                       <p className="text-slate-400 text-sm mt-1">
                           Connect your Plus/Pro account using OpenCode OAuth.
                       </p>
                   </div>
                   
                   <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
                       
                       {/* Step 1: Install & Login */}
                       <div className="space-y-4">
                           <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                               <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs border border-indigo-500/30">1</span>
                               Run Connection Commands
                           </h4>
                           <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3">
                               <p className="text-xs text-slate-400">Run these commands in your terminal to authenticate with OpenCode:</p>
                               
                               <div className="space-y-2">
                                   {[
                                       "npx -y opencode-openai-codex-auth@latest",
                                       "opencode auth login",
                                       "opencode models openai"
                                   ].map((cmd, i) => (
                                       <div key={i} className="flex items-center gap-2 bg-[#0a0a0a] rounded-lg p-2 border border-white/5 group">
                                           <div className="text-slate-500 px-2 select-none pointer-events-none text-xs">$</div>
                                           <code className="flex-1 font-mono text-xs text-emerald-300 overflow-x-auto whitespace-nowrap scrollbar-none">
                                               {cmd}
                                           </code>
                                           <button 
                                            onClick={() => copyToClipboard(cmd)}
                                            className="p-1.5 text-slate-500 hover:text-white transition-colors relative"
                                            title="Copy command"
                                           >
                                               {copiedCmd === cmd ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                           </button>
                                       </div>
                                   ))}
                               </div>
                           </div>
                       </div>

                       {/* Step 2: Headless Fallback */}
                       <div className="space-y-4">
                           <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                               <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs border border-orange-500/30">2</span>
                               Headless / Remote Fallback
                           </h4>
                           <div className="bg-black/40 border border-white/10 rounded-xl p-4">
                               <p className="text-xs text-slate-400 mb-3">If the browser doesn't open automatically, use device flow:</p>
                               <div className="flex items-center gap-2 bg-[#0a0a0a] rounded-lg p-2 border border-white/5">
                                   <div className="text-slate-500 px-2 select-none pointer-events-none text-xs">$</div>
                                   <code className="flex-1 font-mono text-xs text-orange-300 overflow-x-auto whitespace-nowrap">
                                       codex login --device-auth
                                   </code>
                                   <button 
                                    onClick={() => copyToClipboard("codex login --device-auth")}
                                    className="p-1.5 text-slate-500 hover:text-white transition-colors"
                                   >
                                       {copiedCmd === "codex login --device-auth" ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                   </button>
                               </div>
                           </div>
                       </div>

                       {/* Step 3: Security Info */}
                       <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex gap-3">
                           <ShieldAlert className="text-yellow-400 shrink-0 mt-0.5" size={18} />
                           <div className="space-y-1">
                               <h5 className="text-sm font-bold text-yellow-200">Security Warning</h5>
                               <p className="text-xs text-yellow-200/80 leading-relaxed">
                                   OpenCode stores credentials locally in <code className="bg-black/20 px-1 rounded mx-0.5">auth.json</code>.
                                   <br/>
                                   <strong>Mac/Linux:</strong> <code className="bg-black/20 px-1 rounded">~/.local/share/opencode/auth.json</code>
                                   <br/>
                                   <strong>Windows:</strong> <code className="bg-black/20 px-1 rounded">%USERPROFILE%\.local\share\opencode\auth.json</code>
                                   <br/>
                                   <span className="font-bold">Do not share this file.</span>
                               </p>
                           </div>
                       </div>
                   </div>

                   <div className="p-6 pt-4 border-t border-white/5 bg-[#15151a] rounded-b-2xl">
                       <button 
                           onClick={() => { setShowConnectModal(false); checkOpenAIStatus(); }}
                           className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-emerald-900/20"
                       >
                           I've completed login, Verify now
                       </button>
                   </div>
               </div>
           </div>
       )}

       {/* Header */}
       <div className="px-4 sm:px-6 py-4 flex items-center gap-4 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 shrink-0 sticky top-0 z-20">
           <button 
            onClick={onToggleSidebar} 
            className="text-slate-400 hover:text-white transition-colors p-2 -ml-2 rounded-lg hover:bg-white/5 active:bg-white/10"
           >
               <PanelLeft size={20} />
           </button>
           <h1 className="text-lg font-bold text-white tracking-tight">Settings</h1>
       </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
            <div className="max-w-3xl mx-auto space-y-8 pb-20">
                
                {/* --- BACKEND CONNECTION --- */}
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl border border-white/10">
                            <Server className="text-indigo-300" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Connection</h2>
                            <p className="text-slate-400 text-xs">Manage connection to Heidi Server</p>
                        </div>
                    </div>

                    <div className="bg-[#0f0f13]/60 backdrop-blur-md rounded-3xl p-5 sm:p-8 border border-white/10 shadow-xl space-y-6">
                        {/* Status Card */}
                        <div className={`p-4 rounded-2xl flex items-center gap-4 border transition-colors ${
                            status === 'connected' ? 'bg-emerald-500/5 border-emerald-500/20' :
                            status === 'error' ? 'bg-red-500/5 border-red-500/20' :
                            'bg-white/5 border-white/5'
                        }`}>
                            <div className={`p-2.5 rounded-xl shrink-0 ${
                                status === 'connected' ? 'bg-emerald-500/20 text-emerald-300' :
                                status === 'error' ? 'bg-red-500/20 text-red-300' :
                                'bg-white/10 text-slate-400'
                            }`}>
                                {status === 'checking' && <Wifi size={20} className="animate-pulse" />}
                                {status === 'connected' && <Wifi size={20} />}
                                {status === 'error' && <AlertTriangle size={20} />}
                                {status === 'idle' && <Server size={20} />}
                            </div>
                            
                            <div className="flex flex-col">
                                <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${
                                    status === 'connected' ? 'text-emerald-400' : 
                                    status === 'error' ? 'text-red-400' : 'text-slate-500'
                                }`}>
                                    System Status
                                </span>
                                <span className="text-sm font-medium text-white">
                                    {status === 'idle' && "Ready to connect"}
                                    {status === 'checking' && "Pinging server..."}
                                    {status === 'connected' && "Backend Online"}
                                    {status === 'error' && "Server Unreachable"}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="group">
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">
                                    <Globe size={12} /> Base URL
                                </label>
                                <input
                                    type="text"
                                    value={baseUrl}
                                    onChange={(e) => setBaseUrl(e.target.value)}
                                    placeholder="http://127.0.0.1:7777"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder-slate-600 font-mono text-xs"
                                />
                            </div>

                            <div className="group">
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">
                                    <Lock size={12} /> API Key
                                </label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder-slate-600 font-mono text-xs"
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex items-center justify-between border-t border-white/5">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                                {msg}
                            </span>
                            <button
                                onClick={handleSave}
                                disabled={status === 'checking'}
                                className="flex items-center gap-2 bg-white text-black hover:bg-slate-200 px-5 py-2 rounded-lg font-bold text-xs transition-colors disabled:opacity-50"
                            >
                                <Save size={14} />
                                Save & Connect
                            </button>
                        </div>
                    </div>
                </section>

                {/* --- INTEGRATIONS --- */}
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                     <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-2xl border border-white/10">
                            <Bot className="text-emerald-300" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Integrations</h2>
                            <p className="text-slate-400 text-xs">Manage AI providers and tools</p>
                        </div>
                    </div>

                    <div className="bg-[#0f0f13]/60 backdrop-blur-md rounded-3xl p-1 border border-white/10 shadow-xl">
                        {/* OpenCode / OpenAI Card */}
                        <div className="p-5 sm:p-6 hover:bg-white/5 transition-colors rounded-[20px]">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                                <div className="flex gap-4">
                                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shrink-0">
                                         {/* Simple OpenAI Logo representation */}
                                         <svg viewBox="0 0 24 24" className="w-8 h-8 text-black" fill="currentColor"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a1.54 1.54 0 0 1 .8312 1.32v5.406a4.481 4.481 0 0 1-5.2877 3.403zM6.9428 10.541a2.9671 2.9671 0 0 0-.33 1.8238l2.0199-1.164a1.54 1.54 0 0 1 1.5801 0l5.8362 3.3668v-2.332l-4.7631-2.747a.7947.7947 0 0 0-.8057 0l-4.7828 2.7602a4.4821 4.4821 0 0 1 1.2455-1.7078zM2.2888 10.128a4.4704 4.4704 0 0 1 .9828-2.9236l4.7648 2.747a.7948.7948 0 0 0 .8057 0l4.8014-2.771-2.02-1.1641a1.54 1.54 0 0 1-.8065-1.3342V2.3384a4.4823 4.4823 0 0 1 2.3218 1.3466 4.4755 4.4755 0 0 1 1.0577 2.809l-4.7695-2.752a.7948.7948 0 0 0-.3927-.6813v6.7369l-2.02-1.1686a1.54 1.54 0 0 1-.8312-1.32V1.903a4.481 4.481 0 0 1 5.2877-3.403z"/></svg>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-base font-bold text-white">OpenAI (ChatGPT)</h3>
                                            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Beta</span>
                                        </div>
                                        <p className="text-slate-400 text-xs mt-1 max-w-xs">
                                            Connect your Plus/Pro account to use advanced models via OpenCode.
                                        </p>
                                    </div>
                                </div>

                                <div className={`self-start px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                                    openaiStatus?.connected 
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                    : 'bg-white/5 text-slate-500 border border-white/10'
                                }`}>
                                    {openaiStatus?.connected ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                    {openaiStatus?.connected ? 'Connected' : 'Not Connected'}
                                </div>
                            </div>
                            
                            {/* Connected Details */}
                            {openaiStatus?.connected && (
                                <div className="mt-4 p-4 bg-black/40 rounded-xl border border-white/5 space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Auth Path</span>
                                            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                                                <Key size={12} className="text-emerald-500" />
                                                <span className="truncate" title={openaiStatus.authPath}>
                                                    {openaiStatus.authPath ? '.../opencode/auth.json' : 'Unknown'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Available Models</span>
                                            <div className="text-xs text-slate-300 flex flex-wrap gap-1">
                                                {openaiStatus.models && openaiStatus.models.length > 0 ? (
                                                    openaiStatus.models.slice(0, 3).map(m => (
                                                        <span key={m} className="bg-white/10 px-1.5 py-0.5 rounded">{m}</span>
                                                    ))
                                                ) : (
                                                    <span className="text-slate-500 italic">None listed</span>
                                                )}
                                                {openaiStatus.models && openaiStatus.models.length > 3 && (
                                                    <span className="text-slate-500 text-[10px] self-center">+{openaiStatus.models.length - 3} more</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {testResult && (
                                        <div className={`mt-2 p-2 rounded-lg text-xs font-mono flex items-center gap-2 ${testResult.pass ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                                            {testResult.pass ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                                            Test Result: {testResult.pass ? 'PASS' : 'FAIL'} 
                                            {testResult.message && <span className="opacity-70"> - {testResult.message}</span>}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Error Display */}
                            {!openaiStatus?.connected && openaiStatus?.lastError && (
                                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/10 rounded-lg flex items-start gap-2">
                                    <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-red-200 font-bold">Connection Check Failed</p>
                                        <p className="text-[10px] text-red-300/70 font-mono mt-0.5">{openaiStatus.lastError}</p>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="mt-6 flex flex-wrap items-center gap-3">
                                {!openaiStatus?.connected ? (
                                    <button 
                                        onClick={() => setShowConnectModal(true)}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2 shadow-lg shadow-indigo-900/20"
                                    >
                                        <Link size={14} />
                                        Connect Account
                                    </button>
                                ) : (
                                    <button 
                                        onClick={handleTestConnection}
                                        disabled={testingOpenai}
                                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
                                    >
                                        {testingOpenai ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                                        Test Connection
                                    </button>
                                )}
                                
                                <button 
                                    onClick={checkOpenAIStatus}
                                    disabled={verifyingOpenai}
                                    className="px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
                                >
                                    {verifyingOpenai ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                    Verify
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    </div>
  );
};

export default Settings;