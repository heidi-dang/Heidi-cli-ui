import React, { useState, useRef, useEffect } from 'react';
import { ai, checkApiKeySelection, db, StoredChat } from '../api/gemini';
import { GenerateContentResponse, Modality, LiveServerMessage } from '@google/genai';
import { PanelLeft, Mic, Send, Image as ImageIcon, Video, Wand2, Sparkles, Loader2, Volume2, Search, MapPin, Play, StopCircle, RefreshCw, Upload, Download, Users, Phone, PhoneOff, Video as VideoIcon, History, Plus, Trash2, MessageSquare, X } from 'lucide-react';
import { useCollaboration, Peer } from '../hooks/useCollaboration';

interface GeminiProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

type Tab = 'chat' | 'create' | 'live';
type CreateMode = 'image' | 'video' | 'edit';
type ChatMessage = { 
    role: 'user' | 'model' | 'peer'; 
    text: string; 
    audio?: string; 
    image?: string; 
    video?: string; 
    mimeType?: string;
    isThinking?: boolean;
    senderId?: string; // For peers
};

export default function Gemini({ isSidebarOpen, onToggleSidebar }: GeminiProps) {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  // Session State
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedChats, setSavedChats] = useState<StoredChat[]>([]);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isFast, setIsFast] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [useMaps, setUseMaps] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [attachment, setAttachment] = useState<{ type: 'image' | 'video'; data: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Collaboration State
  const [collabRoomId, setCollabRoomId] = useState('');
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const { peers, messages: remoteMessages, typingUsers, broadcastMessage, broadcastTyping, startCall, endCall, localStream } = useCollaboration(activeRoom);
  const [isInCall, setIsInCall] = useState(false);

  // Create State
  const [createMode, setCreateMode] = useState<CreateMode>('image');
  const [createPrompt, setCreatePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState('1K');
  const [generatedMedia, setGeneratedMedia] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [referenceImage, setReferenceImage] = useState<{ data: string; mimeType: string } | null>(null);

  // Live State
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [liveStatus, setLiveStatus] = useState('Disconnected');
  const [liveVolume, setLiveVolume] = useState(0);

  // --- Persistence Logic ---

  // Load history list
  const refreshHistory = async () => {
    try {
        const list = await db.listChats();
        setSavedChats(list);
    } catch (e) {
        console.error("Failed to load history", e);
    }
  };

  useEffect(() => {
      refreshHistory();
  }, [historyOpen]);

  // Auto-scroll
  useEffect(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing, typingUsers]);

  // Auto-save Effect
  useEffect(() => {
    const save = async () => {
        if (messages.length > 0) {
            // Use first user message as title, or "New Chat"
            const firstUserMsg = messages.find(m => m.role === 'user');
            const title = firstUserMsg ? firstUserMsg.text.slice(0, 40) : 'Untitled Conversation';
            
            await db.saveChat({
                id: sessionId,
                title: title || 'New Chat',
                messages,
                updatedAt: Date.now()
            });
        }
    };
    // Debounce slightly to avoid thrashing DB on every keystroke/token if streaming were granular
    const timer = setTimeout(save, 1000);
    return () => clearTimeout(timer);
  }, [messages, sessionId]);

  const loadSession = (chat: StoredChat) => {
      setSessionId(chat.id);
      setMessages(chat.messages);
      setHistoryOpen(false);
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await db.deleteChat(id);
      if (id === sessionId) {
          handleNewChat();
      }
      refreshHistory();
  };

  const handleNewChat = () => {
      setSessionId(crypto.randomUUID());
      setMessages([]);
      setPrompt('');
      setAttachment(null);
      setGeneratedMedia(null);
      setHistoryOpen(false);
  };

  // --- Sync Remote Messages ---
  useEffect(() => {
      if (remoteMessages.length > 0) {
          const lastMsg = remoteMessages[remoteMessages.length - 1];
          const newMsg: ChatMessage = {
              role: 'peer',
              text: lastMsg.text,
              senderId: lastMsg.senderId,
              image: lastMsg.attachment?.type === 'image' ? lastMsg.attachment.data : undefined,
              video: lastMsg.attachment?.type === 'video' ? lastMsg.attachment.data : undefined,
              mimeType: lastMsg.attachment?.mimeType
          };
          setMessages(prev => [...prev, newMsg]);
      }
  }, [remoteMessages]);

  // --- Typing Broadcast ---
  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(e.target.value);
      if (activeRoom) {
          broadcastTyping(true);
          const timeout = setTimeout(() => broadcastTyping(false), 2000);
          return () => clearTimeout(timeout);
      }
  };

  // --- Chat Logic ---

  const handleSendMessage = async () => {
    if (!prompt.trim() && !attachment) return;

    // Capture attachment in local scope before state clear
    const currentAttachment = attachment;

    const userMsg: ChatMessage = { role: 'user', text: prompt };
    if (currentAttachment) {
      if (currentAttachment.type === 'image') {
          userMsg.image = currentAttachment.data;
          userMsg.mimeType = currentAttachment.mimeType;
      }
      if (currentAttachment.type === 'video') {
          userMsg.video = currentAttachment.data;
          userMsg.mimeType = currentAttachment.mimeType;
      }
    }
    
    setMessages(prev => [...prev, userMsg]);
    
    // Broadcast if in room
    if (activeRoom) {
        broadcastMessage(prompt, currentAttachment);
    }

    setPrompt('');
    setAttachment(null);
    setIsProcessing(true);

    try {
      let model = 'gemini-3-pro-preview';
      let config: any = {};

      // Determine model based on flags and attachment
      if (isFast) {
        model = 'gemini-2.5-flash-lite';
      } else if (isThinking) {
        model = 'gemini-3-pro-preview';
        config.thinkingConfig = { thinkingBudget: 32768 };
      } else if (useSearch) {
        model = 'gemini-3-flash-preview';
        config.tools = [{ googleSearch: {} }];
      } else if (useMaps) {
        model = 'gemini-2.5-flash';
        config.tools = [{ googleMaps: {} }];
      } else if (currentAttachment && currentAttachment.type === 'video') {
         model = 'gemini-3-pro-preview'; // Video understanding
      } else if (currentAttachment && currentAttachment.type === 'image') {
         model = 'gemini-3-pro-preview'; // Image understanding
      }

      // Prepare contents
      let contents: any = { parts: [{ text: userMsg.text }] };
      if (userMsg.image) {
        contents.parts.unshift({ inlineData: { data: userMsg.image, mimeType: userMsg.mimeType || 'image/jpeg' } });
      }
      if (userMsg.video) {
        contents.parts.unshift({ inlineData: { data: userMsg.video, mimeType: userMsg.mimeType || 'video/mp4' } });
      }

      // Check key for Pro models if needed
      if (model.includes('pro-preview')) await checkApiKeySelection();

      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });

      const text = response.text || "No text response.";
      
      // Check for grounding
      let groundingInfo = '';
      if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
         groundingInfo = "\n\nSources:\n" + response.candidates[0].groundingMetadata.groundingChunks
            .map((c: any) => c.web?.uri || c.maps?.uri).filter(Boolean).join('\n');
      }

      const aiMsg: ChatMessage = { role: 'model', text: text + groundingInfo };
      setMessages(prev => [...prev, aiMsg]);
      
      if (activeRoom) {
          broadcastMessage(`[AI Response]: ${text + groundingInfo}`);
      }

    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'model', text: `Error: ${e.message}` }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTranscribe = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks: Blob[] = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                const base64Audio = (reader.result as string).split(',')[1];
                setIsProcessing(true);
                try {
                     const response = await ai.models.generateContent({
                        model: 'gemini-3-flash-preview',
                        contents: {
                            parts: [
                                { inlineData: { mimeType: 'audio/wav', data: base64Audio } },
                                { text: "Transcribe this audio exactly." }
                            ]
                        }
                    });
                    setPrompt(prev => prev + " " + (response.text || ""));
                } catch (e) {
                    console.error(e);
                } finally {
                    setIsProcessing(false);
                }
            };
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setLiveStatus("Recording...");
        setTimeout(() => {
            mediaRecorder.stop();
            setLiveStatus("Disconnected");
        }, 5000); // Record for 5 seconds for simple test
    } catch (e) {
        console.error("Mic permission denied", e);
    }
  };

  const handleTTS = async (text: string) => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            },
        });
        const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64) {
            const audio = new Audio(`data:audio/wav;base64,${base64}`);
            audio.play();
        }
    } catch (e) {
        console.error("TTS Failed", e);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          setAttachment({
              type: file.type.startsWith('video') ? 'video' : 'image',
              data: base64,
              mimeType: file.type
          });
      };
      reader.readAsDataURL(file);
  };

  // --- Create Logic ---

  const handleCreate = async () => {
    if (!createPrompt.trim() && createMode !== 'edit') return;
    setIsGenerating(true);
    setGeneratedMedia(null);

    try {
        if (createMode === 'image') {
            await checkApiKeySelection();
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { parts: [{ text: createPrompt }] },
                config: {
                    imageConfig: { aspectRatio, imageSize }
                }
            });
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    setGeneratedMedia(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                    break;
                }
            }
        } else if (createMode === 'video') {
             await checkApiKeySelection();
             let operation = await ai.models.generateVideos({
                 model: 'veo-3.1-fast-generate-preview',
                 prompt: createPrompt,
                 config: { numberOfVideos: 1, resolution: '720p', aspectRatio: aspectRatio as any }
             });
             while (!operation.done) {
                 await new Promise(r => setTimeout(r, 5000));
                 operation = await ai.operations.getVideosOperation({operation});
             }
             const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
             if (uri) {
                 const vidRes = await fetch(`${uri}&key=${process.env.API_KEY}`);
                 const blob = await vidRes.blob();
                 setGeneratedMedia(URL.createObjectURL(blob));
             }
        } else if (createMode === 'edit') {
             if (!referenceImage) throw new Error("Reference image required for editing");
             const response = await ai.models.generateContent({
                 model: 'gemini-2.5-flash-image',
                 contents: {
                     parts: [
                         { inlineData: { data: referenceImage.data, mimeType: referenceImage.mimeType } },
                         { text: createPrompt }
                     ]
                 }
             });
             for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    setGeneratedMedia(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                    break;
                }
            }
        }
    } catch (e: any) {
        alert("Generation failed: " + e.message);
    } finally {
        setIsGenerating(false);
    }
  };

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setReferenceImage({ data: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  // --- Live Logic ---

  const liveSessionRef = useRef<any>(null);

  const toggleLive = async () => {
    if (isLiveConnected) {
        if (liveSessionRef.current) {
            window.location.reload(); 
        }
        setIsLiveConnected(false);
        setLiveStatus("Disconnected");
    } else {
        setLiveStatus("Connecting...");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new window.AudioContext({ sampleRate: 16000 });
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                callbacks: {
                    onopen: () => {
                        setLiveStatus("Connected - Listening");
                        setIsLiveConnected(true);
                    },
                    onmessage: async (msg: LiveServerMessage) => {
                         const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                         if (audioData) {
                             playLiveAudio(audioData);
                         }
                    },
                    onclose: () => {
                        setLiveStatus("Disconnected");
                        setIsLiveConnected(false);
                    },
                    onerror: (e) => {
                        console.error(e);
                        setLiveStatus("Error");
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
                }
            });
            
            liveSessionRef.current = sessionPromise;

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = inputData[i] * 0x7FFF;
                }
                let binary = '';
                const bytes = new Uint8Array(pcmData.buffer);
                for (let i = 0; i < bytes.byteLength; i++) {
                     binary += String.fromCharCode(bytes[i]);
                }
                const b64 = btoa(binary);

                sessionPromise.then(session => {
                    session.sendRealtimeInput({
                        media: {
                            mimeType: 'audio/pcm;rate=16000',
                            data: b64
                        }
                    });
                });
                const vol = inputData.reduce((a, b) => a + Math.abs(b), 0) / inputData.length;
                setLiveVolume(vol * 5); 
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

        } catch (e) {
            console.error(e);
            setLiveStatus("Connection Failed");
        }
    }
  };

  const playLiveAudio = async (base64: string) => {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
      
      const ctx = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 24000});
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for(let i=0; i<int16.length; i++) float32[i] = int16[i] / 32768.0;
      
      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
  };

  // --- Render ---

  return (
    <div className="flex flex-col h-full bg-transparent text-white relative overflow-hidden">
       {/* History Sidebar/Drawer */}
       <div className={`absolute inset-y-0 right-0 w-80 bg-[#0f0c29]/95 backdrop-blur-xl border-l border-white/10 z-40 transition-transform duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)] transform ${historyOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full'}`}>
           <div className="flex items-center justify-between p-5 border-b border-white/10 bg-black/20">
               <h2 className="font-bold flex items-center gap-2 text-sm text-slate-200"><History size={16} className="text-indigo-400"/> Chat History</h2>
               <button onClick={() => setHistoryOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"><X size={18}/></button>
           </div>
           <div className="p-4 space-y-2 overflow-y-auto h-[calc(100%-70px)] custom-scrollbar">
               <button onClick={handleNewChat} className="w-full flex items-center gap-2 justify-center py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-xl text-sm font-bold shadow-lg shadow-indigo-900/20 transition-all transform active:scale-95 mb-4">
                   <Plus size={16} /> New Chat
               </button>
               {savedChats.length === 0 && <p className="text-slate-500 text-xs text-center py-4">No saved chats</p>}
               {savedChats.map(chat => (
                   <div key={chat.id} className={`group flex items-center justify-between p-3 rounded-xl text-left text-sm transition-all border cursor-pointer ${chat.id === sessionId ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200' : 'bg-white/5 border-transparent hover:bg-white/10 text-slate-300 hover:border-white/5'}`} onClick={() => loadSession(chat)}>
                       <div className="flex-1 truncate mr-2">
                           <div className="font-medium truncate">{chat.title || 'Untitled'}</div>
                           <div className="text-[10px] text-slate-500 mt-0.5">{new Date(chat.updatedAt).toLocaleDateString()}</div>
                       </div>
                       <button onClick={(e) => deleteSession(e, chat.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Delete">
                           <Trash2 size={14} />
                       </button>
                   </div>
               ))}
           </div>
       </div>

       {/* Overlay for mobile history */}
       {historyOpen && (
           <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-30 md:hidden" onClick={() => setHistoryOpen(false)} />
       )}

       {/* Header */}
       <div className="px-6 py-4 flex items-center justify-between bg-black/20 backdrop-blur-md border-b border-white/5 z-20 shrink-0">
           <div className="flex items-center gap-4">
            <button onClick={onToggleSidebar} className="text-slate-400 hover:text-white p-2 -ml-2 rounded-lg hover:bg-white/5 transition-colors">
                <PanelLeft size={20} />
            </button>
            <h1 className="text-lg font-bold flex items-center gap-2 tracking-tight">
                <Sparkles size={20} className="text-indigo-400" />
                Gemini Studio
            </h1>
           </div>

           {/* Collaboration Joiner */}
           <div className="flex items-center gap-2">
             {!activeRoom ? (
               <div className="hidden md:flex bg-white/5 rounded-lg border border-white/10 p-0.5 transition-colors focus-within:border-indigo-500/50">
                  <input 
                    type="text" 
                    placeholder="Room ID" 
                    value={collabRoomId}
                    onChange={(e) => setCollabRoomId(e.target.value)}
                    className="bg-transparent border-none text-xs px-3 py-1.5 outline-none w-24 text-white placeholder-slate-500"
                  />
                  <button 
                    onClick={() => setActiveRoom(collabRoomId)}
                    disabled={!collabRoomId}
                    className="px-3 py-1.5 bg-indigo-600/20 text-indigo-300 rounded-md text-xs font-medium hover:bg-indigo-600/30 disabled:opacity-50 transition-colors"
                  >
                    Join
                  </button>
               </div>
             ) : (
                <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-emerald-300 font-mono font-bold">Room: {activeRoom}</span>
                    <div className="w-px h-3 bg-emerald-500/20 mx-1"></div>
                    <Users size={12} className="text-emerald-300" />
                    <span className="text-xs text-emerald-300 font-bold">{peers.length + 1}</span>
                    <button onClick={() => { setActiveRoom(null); setIsInCall(false); endCall(); }} className="ml-2 hover:text-white text-emerald-400 transition-colors" title="Leave Room">
                        <StopCircle size={14} />
                    </button>
                </div>
             )}
           </div>
           
           <div className="flex items-center gap-3">
               <div className="flex bg-white/5 rounded-xl p-1">
                   {(['chat', 'create', 'live'] as Tab[]).map(t => (
                       <button
                        key={t}
                        onClick={() => setActiveTab(t)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === t ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                       >
                           {t.charAt(0).toUpperCase() + t.slice(1)}
                       </button>
                   ))}
               </div>
               
               <button 
                onClick={() => setHistoryOpen(!historyOpen)}
                className={`p-2.5 rounded-xl transition-all duration-200 ${historyOpen ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                title="History"
               >
                   <History size={20} />
               </button>
           </div>
       </div>

       <div className="flex-1 overflow-hidden relative">
           
           {/* CHAT TAB */}
           {activeTab === 'chat' && (
               <div className="h-full flex flex-col relative">
                   {/* Call Grid Overlay */}
                   {isInCall && (
                     <div className="absolute top-0 left-0 right-0 h-48 bg-black/80 z-20 flex gap-2 p-2 overflow-x-auto border-b border-white/10 custom-scrollbar">
                        {/* Local */}
                        <div className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 shadow-lg">
                           <video 
                              ref={el => { if(el && localStream) el.srcObject = localStream }} 
                              autoPlay muted playsInline 
                              className="w-full h-full object-cover" 
                           />
                           <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[10px] font-bold text-white border border-white/10">You</div>
                        </div>
                        {/* Remotes */}
                        {peers.map(p => p.stream ? (
                             <div key={p.id} className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 shadow-lg">
                                <video 
                                    ref={el => { if(el && p.stream) el.srcObject = p.stream }} 
                                    autoPlay playsInline 
                                    className="w-full h-full object-cover" 
                                />
                                <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[10px] font-bold text-white border border-white/10">{p.id.slice(0,4)}</div>
                             </div>
                        ) : null)}
                     </div>
                   )}

                   <div className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar ${isInCall ? 'pt-52' : ''}`}>
                       {messages.length === 0 && (
                           <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-6 opacity-0 animate-in fade-in zoom-in duration-500">
                               <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.1)]">
                                   <Sparkles size={40} className="text-indigo-400" />
                               </div>
                               <div className="text-center space-y-2">
                                   <h3 className="text-xl font-bold text-white">Gemini Studio</h3>
                                   <p className="text-sm max-w-xs mx-auto">Start a conversation, create media, or collaborate in real-time.</p>
                               </div>
                           </div>
                       )}
                       {messages.map((m, i) => (
                           <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                               {(m.role === 'model' || m.role === 'peer') && (
                                   <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border shadow-md mt-1 ${m.role === 'peer' ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-indigo-500/20 border-indigo-500/30'}`}>
                                       {m.role === 'peer' ? <Users size={14} className="text-emerald-300" /> : <Sparkles size={14} className="text-indigo-300" />}
                                   </div>
                               )}
                               <div className={`max-w-[85%] md:max-w-[75%] p-4 rounded-2xl shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white/5 text-slate-200 rounded-tl-sm border border-white/5'}`}>
                                   {m.role === 'peer' && <div className="text-[10px] font-bold text-emerald-400 mb-1 opacity-80 uppercase tracking-wide">Peer {m.senderId?.slice(0,4)}</div>}
                                   {m.image && (
                                        <div className="mb-3 rounded-xl overflow-hidden border border-white/10 bg-black/20">
                                            <img 
                                                src={`data:${m.mimeType || 'image/jpeg'};base64,${m.image}`} 
                                                alt="uploaded" 
                                                className="max-h-64 w-auto object-contain" 
                                            />
                                        </div>
                                   )}
                                   {m.video && (
                                        <div className="mb-3 rounded-xl overflow-hidden border border-white/10 bg-black/20">
                                            <video 
                                                src={`data:${m.mimeType || 'video/mp4'};base64,${m.video}`} 
                                                controls 
                                                className="max-h-64 w-auto" 
                                            />
                                        </div>
                                   )}
                                   <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</div>
                                   {m.role === 'model' && (
                                       <div className="mt-3 pt-2 border-t border-white/5 flex justify-end">
                                            <button onClick={() => handleTTS(m.text)} className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-white/5 rounded-lg transition-colors" title="Read Aloud">
                                                <Volume2 size={14} />
                                            </button>
                                       </div>
                                   )}
                               </div>
                           </div>
                       ))}
                       {isProcessing && (
                           <div className="flex gap-3 items-center text-indigo-300/70 text-sm animate-pulse pl-2">
                               <div className="w-8 h-8 flex items-center justify-center">
                                    <Loader2 size={16} className="animate-spin" /> 
                               </div>
                               <span>Gemini is thinking...</span>
                           </div>
                       )}
                       {typingUsers.length > 0 && (
                           <div className="text-xs text-slate-500 italic ml-14 animate-pulse">
                               {typingUsers.length} person(s) typing...
                           </div>
                       )}
                       <div ref={chatBottomRef} className="h-4" />
                   </div>
                   
                   <div className="p-4 md:p-6 bg-black/20 border-t border-white/5 z-10 shrink-0">
                       <div className="max-w-4xl mx-auto space-y-3">
                           {/* Config Toggles */}
                           <div className="flex items-center justify-between">
                               <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                                    <button onClick={() => setIsThinking(!isThinking)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide border transition-all ${isThinking ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'border-white/10 text-slate-400 hover:border-white/20'}`}>
                                        <div className="flex items-center gap-1.5"><Wand2 size={12} /> Deep Think</div>
                                    </button>
                                    <button onClick={() => setIsFast(!isFast)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide border transition-all ${isFast ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.2)]' : 'border-white/10 text-slate-400 hover:border-white/20'}`}>
                                        <div className="flex items-center gap-1.5"><Loader2 size={12} /> Fast</div>
                                    </button>
                                    <button onClick={() => setUseSearch(!useSearch)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide border transition-all ${useSearch ? 'bg-blue-500/20 border-blue-500 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'border-white/10 text-slate-400 hover:border-white/20'}`}>
                                        <div className="flex items-center gap-1.5"><Search size={12} /> Search</div>
                                    </button>
                               </div>

                               {activeRoom && (
                                   <button 
                                     onClick={() => {
                                         if(isInCall) {
                                             endCall();
                                             setIsInCall(false);
                                         } else {
                                             startCall();
                                             setIsInCall(true);
                                         }
                                     }}
                                     className={`p-2 rounded-full transition-all ${isInCall ? 'bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}
                                     title={isInCall ? "End Call" : "Start Video Call"}
                                   >
                                       {isInCall ? <PhoneOff size={16} /> : <VideoIcon size={16} />}
                                   </button>
                               )}
                           </div>

                           <div className="relative group">
                               <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl blur-xl group-focus-within:bg-indigo-500/10 transition-colors pointer-events-none"></div>
                               <textarea
                                   value={prompt}
                                   onChange={handleTyping}
                                   onKeyDown={(e) => {
                                       if (e.key === 'Enter' && !e.shiftKey) {
                                           e.preventDefault();
                                           handleSendMessage();
                                       }
                                   }}
                                   className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 pr-32 text-white focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none resize-none shadow-xl relative z-10 text-sm md:text-base"
                                   placeholder="Ask Gemini anything..."
                                   rows={1}
                                   style={{ minHeight: '60px', maxHeight: '150px' }}
                               />
                               <div className="absolute right-2 bottom-2 flex items-center gap-1 z-20">
                                   <button onClick={() => fileInputRef.current?.click()} className={`p-2.5 rounded-xl transition-all ${attachment ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} title="Attach Media">
                                       {attachment ? <CheckCircle size={18} /> : <Upload size={18} />}
                                   </button>
                                   <button onClick={handleTranscribe} className="p-2.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors" title="Dictate">
                                       <Mic size={18} />
                                   </button>
                                   <button 
                                    onClick={handleSendMessage} 
                                    disabled={isProcessing || (!prompt.trim() && !attachment)} 
                                    className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-indigo-600/20 transition-all transform active:scale-95"
                                   >
                                       <Send size={18} />
                                   </button>
                               </div>
                               <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,video/*" />
                           </div>
                       </div>
                   </div>
               </div>
           )}

           {/* CREATE TAB */}
           {activeTab === 'create' && (
               <div className="h-full overflow-y-auto p-8 custom-scrollbar">
                   <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                       <div className="flex justify-center gap-2 bg-black/30 p-1.5 rounded-xl w-fit mx-auto border border-white/10">
                           {(['image', 'video', 'edit'] as CreateMode[]).map(m => (
                               <button key={m} onClick={() => setCreateMode(m)} className={`px-6 py-2 rounded-lg transition-all text-sm font-bold uppercase tracking-wide ${createMode === m ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                                   {m}
                               </button>
                           ))}
                       </div>

                       <div className="bg-[#13111c] border border-white/5 rounded-3xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
                           <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 rounded-full blur-[80px] pointer-events-none -mr-16 -mt-16"></div>
                           
                           <div>
                               <label className="text-xs font-bold text-indigo-300 uppercase block mb-3 tracking-wider">Prompt Description</label>
                               <textarea 
                                   value={createPrompt} 
                                   onChange={e => setCreatePrompt(e.target.value)}
                                   className="w-full bg-black/30 border border-white/10 rounded-xl p-4 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 text-white placeholder-slate-600 transition-all"
                                   rows={3}
                                   placeholder={`Describe the ${createMode} you want to generate...`}
                               />
                           </div>

                           {createMode === 'edit' && (
                               <div>
                                   <label className="text-xs font-bold text-indigo-300 uppercase block mb-3 tracking-wider">Reference Image</label>
                                   <div className="relative group">
                                       <input type="file" onChange={handleRefImageUpload} accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"/>
                                       <div className={`w-full border border-dashed border-white/20 rounded-xl p-6 text-center transition-all group-hover:border-indigo-500/50 group-hover:bg-indigo-500/5 ${referenceImage ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}>
                                           {referenceImage ? (
                                               <div className="flex items-center justify-center gap-2 text-emerald-400 font-medium"><CheckCircle size={16}/> Image Loaded</div>
                                           ) : (
                                               <div className="text-slate-500 flex flex-col items-center gap-2">
                                                   <ImageIcon size={24} className="opacity-50"/>
                                                   <span className="text-sm">Click to upload reference image</span>
                                               </div>
                                           )}
                                       </div>
                                   </div>
                               </div>
                           )}

                           {createMode !== 'edit' && (
                            <div className="flex flex-col sm:flex-row gap-6">
                                <div className="flex-1">
                                    <label className="text-xs font-bold text-indigo-300 uppercase block mb-3 tracking-wider">Aspect Ratio</label>
                                    <div className="relative">
                                        <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none appearance-none focus:border-indigo-500/50 cursor-pointer">
                                            <option value="1:1">1:1 (Square)</option>
                                            <option value="16:9">16:9 (Landscape)</option>
                                            <option value="9:16">9:16 (Portrait)</option>
                                            <option value="4:3">4:3</option>
                                            <option value="3:4">3:4</option>
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                                        </div>
                                    </div>
                                </div>
                                {createMode === 'image' && (
                                    <div className="flex-1">
                                        <label className="text-xs font-bold text-indigo-300 uppercase block mb-3 tracking-wider">Resolution</label>
                                        <div className="relative">
                                            <select value={imageSize} onChange={e => setImageSize(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none appearance-none focus:border-indigo-500/50 cursor-pointer">
                                                <option value="1K">1K (Standard)</option>
                                                <option value="2K">2K (High)</option>
                                                <option value="4K">4K (Ultra)</option>
                                            </select>
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                           )}

                           <button onClick={handleCreate} disabled={isGenerating || !createPrompt} className="w-full py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-size-200 animate-gradient rounded-xl font-bold text-white shadow-lg shadow-indigo-900/40 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:transform-none mt-2">
                               {isGenerating ? (
                                   <div className="flex items-center justify-center gap-3">
                                       <Loader2 className="animate-spin" size={20} /> 
                                       <span>Generating Magic...</span>
                                   </div>
                               ) : (
                                   <div className="flex items-center justify-center gap-2">
                                       <Wand2 size={18} />
                                       <span>Generate {createMode}</span>
                                   </div>
                               )}
                           </button>
                       </div>

                       {generatedMedia && (
                           <div className="bg-black/40 rounded-3xl overflow-hidden border border-white/10 relative group shadow-2xl animate-in fade-in zoom-in duration-500">
                               {createMode === 'video' ? (
                                   <video src={generatedMedia} controls className="w-full h-auto" autoPlay loop />
                               ) : (
                                   <img src={generatedMedia} alt="Generated" className="w-full h-auto object-cover" />
                               )}
                               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-6">
                                   <a href={generatedMedia} download={`generated_${Date.now()}.${createMode === 'video' ? 'mp4' : 'png'}`} className="bg-white text-black p-3 rounded-xl hover:scale-110 transition-transform shadow-lg">
                                       <Download size={24} />
                                   </a>
                               </div>
                           </div>
                       )}
                   </div>
               </div>
           )}

           {/* LIVE TAB */}
           {activeTab === 'live' && (
               <div className="h-full flex flex-col items-center justify-center p-8 relative overflow-hidden">
                   {/* Visualizer Background */}
                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] transition-transform duration-100 ease-out" style={{ transform: `scale(${1 + liveVolume * 2})` }}></div>
                        <div className="absolute w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[80px] transition-transform duration-100 ease-out delay-75" style={{ transform: `scale(${1 + liveVolume * 1.5})` }}></div>
                   </div>

                   <div className="z-10 text-center space-y-12 animate-in fade-in zoom-in duration-700">
                       <div className="space-y-2">
                           <h2 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 via-white to-purple-200 tracking-tight">
                               {liveStatus}
                           </h2>
                           <p className="text-slate-400 text-lg">Real-time multimodal interaction</p>
                       </div>
                       
                       <div className="relative inline-block">
                           {isLiveConnected && (
                               <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl animate-pulse opacity-50"></div>
                           )}
                           <button 
                            onClick={toggleLive}
                            className={`relative w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95 border-4 ${isLiveConnected ? 'bg-black border-red-500 text-red-500' : 'bg-gradient-to-br from-indigo-600 to-purple-700 border-white/10 text-white'}`}
                           >
                               {isLiveConnected ? <StopCircle size={48} /> : <Mic size={48} />}
                           </button>
                       </div>

                       <div className="max-w-md mx-auto bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/5 text-slate-300 leading-relaxed text-sm">
                           {isLiveConnected 
                            ? <div className="flex items-center justify-center gap-3"><div className="w-2 h-2 bg-red-500 rounded-full animate-ping"/> Listening... Speak naturally to Gemini.</div>
                            : "Click the microphone to start a low-latency voice session with Gemini 2.5."}
                       </div>
                   </div>
               </div>
           )}

       </div>
    </div>
  );
}

const CheckCircle = ({size, className}: any) => <div className={className}><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>;