import React, { useEffect, useState } from 'react';
import { api } from '../api/heidi';
import { AuthProvider } from '../types';
import { Github, LogIn, Loader2, AlertCircle } from 'lucide-react';

export default function Login() {
    const [providers, setProviders] = useState<AuthProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [loggingInProvider, setLoggingInProvider] = useState<string | null>(null);

    useEffect(() => {
        api.getAuthProviders()
            .then(setProviders)
            .catch(() => setError("Failed to load providers"))
            .finally(() => setLoading(false));
    }, []);

    const handleLogin = async (providerId: string) => {
        setLoggingInProvider(providerId);
        setError('');
        try {
            // Get the redirect URL from backend
            const authUrl = await api.getLoginUrl(providerId);
            if (authUrl) {
                // Redirect browser to the provider's login page
                window.location.href = authUrl;
            } else {
                throw new Error("No authorization URL returned");
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Login failed to start");
            setLoggingInProvider(null);
        }
    };

    const getProviderIcon = (id: string) => {
        if (id.includes('github')) return <Github size={20} />;
        return <LogIn size={20} />;
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f0c29] text-white p-4">
            <div className="w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-[50px] pointer-events-none -mr-8 -mt-8"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-[50px] pointer-events-none -ml-8 -mb-8"></div>

                <div className="text-center mb-10 relative z-10">
                    <div className="w-20 h-20 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-purple-900/40 mb-4 p-0.5">
                        <img src="/heidiai_logo.png" alt="Heidi" className="w-full h-full object-contain p-2 rounded-[14px]" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mb-2">Welcome to Heidi AI</h1>
                    <p className="text-slate-400 text-sm">Sign in to continue to your workspace</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-300 text-sm">
                        <AlertCircle size={18} />
                        {error}
                    </div>
                )}

                <div className="space-y-3 relative z-10">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="animate-spin text-indigo-400" size={32} />
                        </div>
                    ) : providers.length === 0 ? (
                        <div className="text-center text-slate-500 py-8">
                            No authentication providers configured.
                            <br/><span className="text-xs">Check backend configuration.</span>
                        </div>
                    ) : (
                        providers.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleLogin(p.id)}
                                disabled={!!loggingInProvider}
                                className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-medium py-3.5 px-6 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                                {loggingInProvider === p.id ? (
                                    <Loader2 className="animate-spin" size={20} />
                                ) : (
                                    getProviderIcon(p.id)
                                )}
                                <span>Sign in with {p.name}</span>
                            </button>
                        ))
                    )}
                </div>

                <div className="mt-8 text-center">
                    <button 
                        onClick={() => window.location.href = '/'}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        Back to Guest Mode (if enabled)
                    </button>
                </div>
            </div>
        </div>
    );
}