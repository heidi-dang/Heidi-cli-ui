import { Agent, LoopRequest, RunDetails, RunRequest, RunResponse, RunSummary, SettingsState, User, AuthProvider } from '../types';

// Default to relative /api path so requests go through Vite proxy (dev) or same-origin (prod)
const DEFAULT_BASE_URL = '/api';
const DEFAULT_API_KEY = (import.meta as any).env?.VITE_HEIDI_API_KEY || '';

export const getSettings = (): SettingsState => {
  return {
    baseUrl: localStorage.getItem('HEIDI_BASE_URL') || DEFAULT_BASE_URL,
    // Use env var as default if no local setting exists, but allow empty string if user cleared it.
    apiKey: localStorage.getItem('HEIDI_API_KEY') !== null 
        ? localStorage.getItem('HEIDI_API_KEY')! 
        : DEFAULT_API_KEY,
  };
};

export const saveSettings = (settings: SettingsState) => {
  localStorage.setItem('HEIDI_BASE_URL', settings.baseUrl);
  localStorage.setItem('HEIDI_API_KEY', settings.apiKey);
};

// Check for query param override on load
const queryParams = new URLSearchParams(window.location.search);
const paramBaseUrl = queryParams.get('baseUrl');
if (paramBaseUrl) {
    saveSettings({ ...getSettings(), baseUrl: paramBaseUrl });
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: newUrl }, '', newUrl);
}

const getHeaders = (customApiKey?: string) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  const { apiKey } = getSettings();
  const key = customApiKey !== undefined ? customApiKey : apiKey;
  
  if (key) {
    headers['X-Heidi-Key'] = key;
  }
  
  return headers;
};

const getBaseUrl = (customUrl?: string) => {
  let url = customUrl || getSettings().baseUrl;
  return url.replace(/\/$/, '');
};

// PKCE Helpers
const generateRandomString = (length: number) => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
        result += charset[values[i] % charset.length];
    }
    return result;
};

const sha256 = async (plain: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return hash;
};

const base64urlencode = (a: ArrayBuffer) => {
    const bytes = new Uint8Array(a);
    let str = '';
    for (const byte of bytes) {
        str += String.fromCharCode(byte);
    }
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

export const generatePKCE = async () => {
    const verifier = generateRandomString(64);
    const hashed = await sha256(verifier);
    const challenge = base64urlencode(hashed);
    return { verifier, challenge };
};

// Robust fetch wrapper to detect CORS/Network issues
const safeFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  try {
    const res = await fetch(url, options);
    return res;
  } catch (error: any) {
    console.error(`Heidi API Request Failed: ${url}`, error);
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error(
        `Connection failed. Ensure backend is accessible at ${getSettings().baseUrl}`
      );
    }
    throw error;
  }
};

export const api = {
  health: async (customBaseUrl?: string, customApiKey?: string): Promise<{ status: string }> => {
    const url = getBaseUrl(customBaseUrl);
    const headers = getHeaders(customApiKey);
    const res = await safeFetch(`${url}/health`, { headers, credentials: 'include' });
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  getAgents: async (): Promise<Agent[]> => {
    try {
      const res = await safeFetch(`${getBaseUrl()}/agents`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      console.warn("Could not fetch agents", e);
      return [];
    }
  },

  startRun: async (payload: RunRequest): Promise<RunResponse> => {
    const body = {
      prompt: payload.prompt,
      executor: payload.executor || 'copilot',
      workdir: payload.workdir || null,
      ...(payload.dry_run ? { dry_run: true } : {})
    };

    const res = await safeFetch(`${getBaseUrl()}/run`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
      credentials: 'include'
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to start run: ${errText}`);
    }
    return res.json();
  },

  startLoop: async (payload: LoopRequest): Promise<RunResponse> => {
    const body = {
      task: payload.task,
      executor: payload.executor || 'copilot',
      max_retries: payload.max_retries ?? 2,
      workdir: payload.workdir || null,
      ...(payload.dry_run ? { dry_run: true } : {})
    };

    const res = await safeFetch(`${getBaseUrl()}/loop`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
      credentials: 'include'
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to start loop: ${errText}`);
    }
    return res.json();
  },

  cancelRun: async (runId: string): Promise<void> => {
    try {
      await safeFetch(`${getBaseUrl()}/runs/${runId}/cancel`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include'
      });
    } catch (e) {
      console.warn("Failed to cancel run via backend", e);
    }
  },

  getRuns: async (limit = 10): Promise<RunSummary[]> => {
    const res = await safeFetch(`${getBaseUrl()}/runs?limit=${limit}`, { headers: getHeaders(), credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch runs');
    return res.json();
  },

  getRun: async (runId: string): Promise<RunDetails> => {
    const res = await safeFetch(`${getBaseUrl()}/runs/${runId}`, { headers: getHeaders(), credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch run details');
    return res.json();
  },

  getStreamUrl: (runId: string): string => {
    return(`${getBaseUrl()}/runs/${runId}/stream`);
  },

  // Auth API
  getMe: async (): Promise<User | null> => {
    try {
      const res = await safeFetch(`${getBaseUrl()}/auth/me`, { headers: getHeaders(), credentials: 'include' });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      return null;
    }
  },

  getAuthProviders: async (): Promise<AuthProvider[]> => {
    try {
      const res = await safeFetch(`${getBaseUrl()}/auth/providers`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      return [];
    }
  },

  loginStart: async (provider: string, redirectUri: string, challenge: string): Promise<{ authorization_url: string }> => {
    const res = await safeFetch(`${getBaseUrl()}/auth/login/start`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            provider,
            redirect_uri: redirectUri,
            code_challenge: challenge,
            code_challenge_method: 'S256'
        }),
        credentials: 'include'
    });
    if (!res.ok) throw new Error("Failed to start login");
    return res.json();
  },

  loginFinish: async (code: string, verifier: string): Promise<User> => {
      const res = await safeFetch(`${getBaseUrl()}/auth/login/finish`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
              code,
              code_verifier: verifier
          }),
          credentials: 'include'
      });
      if (!res.ok) throw new Error("Failed to finish login");
      return res.json();
  },

  logout: async (): Promise<void> => {
      await safeFetch(`${getBaseUrl()}/auth/logout`, {
          method: 'POST',
          headers: getHeaders(),
          credentials: 'include'
      });
  }
};