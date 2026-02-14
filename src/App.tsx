import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Gemini from './pages/Gemini';

function App() {
  const [currentView, setCurrentView] = useState<'chat' | 'settings' | 'gemini'>('chat');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [refreshSidebarTrigger, setRefreshSidebarTrigger] = useState(0);
  
  // Default to open on desktop, closed on mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  // Monitor screen size
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile && !isSidebarOpen) {
          setIsSidebarOpen(true); 
      } else if (mobile && isSidebarOpen) {
          setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNavigate = (view: 'chat' | 'settings' | 'gemini') => {
    setCurrentView(view);
    if (view === 'settings' || view === 'gemini') {
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

  return (
    <div className="flex h-[100dvh] w-full bg-[#050505] text-slate-100 overflow-hidden font-sans selection:bg-purple-500/30 relative">
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/10 rounded-full blur-[120px] opacity-40 animate-pulse"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px] opacity-40 delay-700 animate-pulse"></div>
      </div>

      {/* Mobile Backdrop */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Wrapper */}
      <aside 
        className={`
          fixed lg:relative z-50 h-full flex-shrink-0
          transition-transform duration-300 cubic-bezier(0.4, 0, 0.2, 1)
          ${isSidebarOpen 
            ? 'translate-x-0' 
            : '-translate-x-full lg:translate-x-0 lg:w-0 lg:opacity-0 lg:overflow-hidden'
          }
          w-[280px] lg:w-[320px]
          border-r border-white/5 bg-[#0a0a0a]/95 backdrop-blur-xl lg:bg-transparent lg:backdrop-blur-none
        `}
      >
        <div className="w-full h-full lg:bg-black/20">
            <Sidebar 
                currentView={currentView}
                onNavigate={handleNavigate}
                onNewChat={handleNewChat}
                onSelectRun={handleSelectRun}
                selectedRunId={selectedRunId}
                refreshTrigger={refreshSidebarTrigger}
                isOpen={isSidebarOpen}
                onToggle={toggleSidebar}
            />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative h-full min-w-0 z-10 bg-gradient-to-b from-transparent to-black/30">
        {currentView === 'gemini' ? (
             <Gemini 
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={toggleSidebar}
             />
        ) : currentView === 'settings' ? (
            <Settings 
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