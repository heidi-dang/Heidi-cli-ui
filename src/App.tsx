import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Gemini from './pages/Gemini';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import { api } from './api/heidi';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';

function App() {
  const [currentView, setCurrentView] = useState<'chat' | 'settings' | 'gemini' | 'login'>('chat');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [refreshSidebarTrigger, setRefreshSidebarTrigger] = useState(0);
  const [isBackendOffline, setIsBackendOffline] = useState(false);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  
  // Basic routing for Auth Callback
  const isAuthCallback = window.location.pathname === '/auth/callback';

  // Default to open on desktop, closed on mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const checkBackend = async () => {
    setIsChecking(true);
    try {
      await api.health();
      setIsBackendOffline(false);
      setIsUnauthorized(false);
    } catch (e: any) {
      if (e.message === 'Unauthorized') {
          setIsUnauthorized(true);
          setIsBackendOffline(false);
      } else {
          setIsBackendOffline(true);
          setIsUnauthorized(false);
      }
    } finally {
      setIsChecking(false);
    }
  };

  // Initial connectivity check
  useEffect(() => {
    if (!isAuthCallback) {
        checkBackend();
    }
  }, [isAuthCallback]);

  // Monitor screen size
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile && !isSidebarOpen && !isAuthCallback && currentView !== 'login') {
          // Optional: Auto-open when resizing to desktop
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSidebarOpen, isAuthCallback, currentView]);

  const handleNavigate = (view: 'chat' | 'settings' | 'gemini' | 'login') => {
    setCurrentView(view);
    if (view === 'settings' || view === 'gemini' || view === 'login') {
        setSelectedRunId(null);
    }
    if (isMobile) setIsSidebarOpen(false);
  };

  const handleSelectRun = (runId: string) => {
    setSelectedRunId(runId);
    setCurrentView('chat');
    if (isMobile) setIsSidebarOpen(false);
  };

  const handleNewChat = () => {
    setSelectedRunId(null);
    setCurrentView('chat');
    if (isMobile) setIsSidebarOpen(false);
  };

  const handleRunCreated = () => {
      setRefreshSidebarTrigger(prev => prev + 1);
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  if (isAuthCallback) {
      return <AuthCallback />;
  }

  return (
    <div className="flex h-screen w-full bg-[#0f0c29] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#240b36] via-[#0f0c29] to-[#000000] text-slate-100 overflow-hidden font-sans selection:bg-pink-500/30 relative">
      
      {/* Backend Offline Banner */}
      {isBackendOffline && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600/90 backdrop-blur-md text-white px-4 py-2 text-sm font-bold flex items-center justify-center gap-4 shadow-xl animate-in slide-in-from-top duration-300">
           <div className="flex items-center gap-2">
             <AlertTriangle size={16} />
             <span>Backend not reachable</span>
           </div>
           <button 
             onClick={checkBackend}
             disabled={isChecking}
             className="flex items-center gap-1.5 px-3 py-1 bg-white text-red-600 rounded-full text-xs hover:bg-red-50 disabled:opacity-75 transition-colors"
           >
             <RefreshCw size={12} className={isChecking ? 'animate-spin' : ''} />
             {isChecking ? 'Checking...' : 'Retry'}
           </button>
        </div>
      )}

      {/* Unauthorized Banner */}
      {isUnauthorized && currentView !== 'login' && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-orange-600/90 backdrop-blur-md text-white px-4 py-2 text-sm font-bold flex items-center justify-center gap-4 shadow-xl animate-in slide-in-from-top duration-300">
           <div className="flex items-center gap-2">
             <LogIn size={16} />
             <span>Authentication Required</span>
           </div>
           <div className="flex gap-2">
             <button 
               onClick={() => setCurrentView('login')}
               className="px-3 py-1 bg-white text-orange-600 rounded-full text-xs hover:bg-orange-50 transition-colors"
             >
               Log In
             </button>
             <button 
               onClick={() => setCurrentView('settings')}
               className="px-3 py-1 bg-black/20 text-white rounded-full text-xs hover:bg-black/30 transition-colors"
             >
               Settings
             </button>
           </div>
        </div>
      )}

      {/* Mobile Backdrop */}
      {isMobile && isSidebarOpen && currentView !== 'login' && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Wrapper */}
      {currentView !== 'login' && (
        <aside 
            className={`
            fixed md:relative z-50 h-full flex-shrink-0
            transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]
            ${isSidebarOpen 
                ? 'translate-x-0 w-[280px] md:w-80' 
                : '-translate-x-full w-[280px] md:translate-x-0 md:w-0 md:opacity-0 md:overflow-hidden'
            }
            bg-black/80 backdrop-blur-xl md:bg-transparent md:backdrop-blur-none border-r border-white/5 md:border-none
            `}
        >
            <div className="w-full h-full md:border-r md:border-white/5 bg-black/20">
                <Sidebar 
                    currentView={currentView}
                    onNavigate={(view) => {
                        if (view === 'chat') handleNewChat();
                        else handleNavigate(view);
                    }}
                    onNewChat={handleNewChat}
                    onSelectRun={handleSelectRun}
                    selectedRunId={selectedRunId}
                    refreshTrigger={refreshSidebarTrigger}
                    isOpen={isSidebarOpen}
                    onToggle={toggleSidebar}
                />
            </div>
        </aside>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col relative h-full min-w-0 bg-gradient-to-b from-transparent to-black/20 ${(isBackendOffline || isUnauthorized) ? 'pt-8' : ''}`}>
        {currentView === 'login' ? (
            <Login />
        ) : currentView === 'settings' ? (
            <Settings 
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={toggleSidebar}
            />
        ) : currentView === 'gemini' ? (
            <Gemini 
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={toggleSidebar}
            />
        ) : (
            <Chat 
                initialRunId={selectedRunId} 
                onRunCreated={handleRunCreated}
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={toggleSidebar}
            />
        )}
      </main>

    </div>
  );
}

export default App;