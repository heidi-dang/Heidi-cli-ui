import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Chat from './pages/Chat';
import Settings from './pages/Settings';

function App() {
  const [currentView, setCurrentView] = useState<'chat' | 'settings'>('chat');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [refreshSidebarTrigger, setRefreshSidebarTrigger] = useState(0);
  
  // Default to open on desktop, closed on mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Monitor screen size
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile && !isSidebarOpen) {
          // Optional: Auto-open when resizing to desktop
          // setIsSidebarOpen(true); 
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSidebarOpen]);

  const handleNavigate = (view: 'chat' | 'settings') => {
    setCurrentView(view);
    if (view === 'settings') {
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
    <div className="flex h-screen w-full bg-[#0f0c29] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#240b36] via-[#0f0c29] to-[#000000] text-slate-100 overflow-hidden font-sans selection:bg-pink-500/30">
      
      {/* Mobile Backdrop */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Wrapper */}
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
                onSelectRun={handleSelectRun}
                selectedRunId={selectedRunId}
                refreshTrigger={refreshSidebarTrigger}
                isOpen={isSidebarOpen}
                onToggle={toggleSidebar}
            />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative h-full min-w-0 bg-gradient-to-b from-transparent to-black/20">
        {currentView === 'settings' ? (
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