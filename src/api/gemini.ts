import { GoogleGenAI } from "@google/genai";

// Initialize the client with the API key from environment variables
// Note: In a real production app, ensure this key is not exposed if not intended for public client-side usage.
export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to check if user needs to select a key for paid features (Veo/Pro Image)
export const checkApiKeySelection = async (): Promise<boolean> => {
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) {
       await (window as any).aistudio.openSelectKey();
       return true;
    }
    return true;
  }
  return true; // Fallback for standard environments assuming process.env.API_KEY is valid
};

// Global type definition for AI Studio helper
declare global {
  interface Window {
    // aistudio is likely defined by the environment/libraries with specific types (AIStudio),
    // so we remove the conflicting 'any' declaration and access it via type assertion above.
    webkitAudioContext: typeof AudioContext;
  }
}

// --- IndexedDB Logic for Chat History ---

const DB_NAME = 'GeminiStudioDB';
const STORE_NAME = 'chats';
const DB_VERSION = 1;

export interface StoredChat {
  id: string;
  title: string;
  messages: any[];
  updatedAt: number;
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
};

export const db = {
  saveChat: async (chat: StoredChat) => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(chat);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  getChat: async (id: string): Promise<StoredChat | undefined> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
       const tx = db.transaction(STORE_NAME, 'readonly');
       const req = tx.objectStore(STORE_NAME).get(id);
       req.onsuccess = () => resolve(req.result);
       req.onerror = () => reject(req.error);
    });
  },
  listChats: async (): Promise<StoredChat[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('updatedAt');
      // @ts-ignore - 'prev' direction is valid but TS might complain depending on lib
      const req = index.openCursor(null, 'prev');
      const results: StoredChat[] = [];
      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  },
  deleteChat: async (id: string) => {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
      });
  }
};