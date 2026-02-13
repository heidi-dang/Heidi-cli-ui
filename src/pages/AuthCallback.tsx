import React, { useEffect, useState } from 'react';
import { api } from '../api/heidi';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function AuthCallback() {
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const handleCallback = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const error = params.get('error');
            const verifier = localStorage.getItem('pkce_verifier');

            if (error) {
                setStatus('error');
                setErrorMsg(params.get('error_description') || error);
                return;
            }

            if (!code || !verifier) {
                setStatus('error');
                setErrorMsg("Missing code or PKCE verifier");
                return;
            }

            try {
                // Exchange code for session
                await api.loginFinish(code, verifier);
                setStatus('success');
                // Clean up
                localStorage.removeItem('pkce_verifier');
                // Redirect home after brief delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 800);
            } catch (e: any) {
                console.error(e);
                setStatus('error');
                setErrorMsg(e.message || "Failed to complete login");
            }
        };

        handleCallback();
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f0c29] text-white">
            <div className="text-center space-y-4 p-8 bg-black/40 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl max-w-sm w-full">
                {status === 'processing' && (
                    <>
                        <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Loader2 className="animate-spin text-indigo-400" size={32} />
                        </div>
                        <h2 className="text-xl font-bold">Authenticating...</h2>
                        <p className="text-slate-400 text-sm">Verifying credentials with server.</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in">
                            <CheckCircle className="text-emerald-400" size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-emerald-400">Success!</h2>
                        <p className="text-slate-400 text-sm">Redirecting you to the app...</p>
                    </>
                )}

                {status === 'error' && (
                    <>
                         <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="text-red-400" size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-red-400">Authentication Failed</h2>
                        <p className="text-slate-300 text-sm bg-white/5 p-3 rounded-lg font-mono text-xs break-words">{errorMsg}</p>
                        <button 
                            onClick={() => window.location.href = '/login'}
                            className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors mt-4"
                        >
                            Try Again
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
