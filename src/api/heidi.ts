import { Agent, LoopRequest, RunDetails, RunRequest, RunResponse, RunSummary, SettingsState, AuthProvider } from '../types';

// Use relative path by default to leverage Vite proxy
const DEFAULT_BASE_URL = '/api';

export const getSettings = (): SettingsState => {
  return {
    baseUrl: localStorage.getItem('HEIDI_BASE_URL') || DEFAULT_BASE_URL,
    apiKey: localStorage.getItem('HEIDI_API_KEY') || '',
  };
};

export const saveSettings = (settings: SettingsState) => {
  localStorage.setItem('HEIDI_BASE_URL', settings.baseUrl);
  localStorage.setItem('HEIDI_API_KEY', settings.apiKey);
};

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
  // Remove trailing slash if present
  return url.replace(/\/$/, '');
};

// PKCE Helper Functions
function generateRandomString(length: number) {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function pkceChallengeFromVerifier(v: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(v);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(a: Uint8Array) {
  let str = "";
  const bytes = new Uint8Array(a);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const generatePKCE = async () => {
  const verifier = generateRandomString(128);
  const challenge = await pkceChallengeFromVerifier(verifier);
  return { verifier, challenge };
};

// Helper for requests with auth
const safeFetch = async (url: string, options: RequestInit = {}) => {
  const res = await fetch(url, {
    ...options,
    credentials: 'include', // Ensure cookies are sent if used
  });
  return res;
};

export const api = {
  health: async (customBaseUrl?: string, customApiKey?: string): Promise<{ status: string }> => {
    const url = getBaseUrl(customBaseUrl);
    const headers = getHeaders(customApiKey);
    const res = await safeFetch(`${url}/health`, { headers });
    
    if (res.status === 401 || res.status === 403) {
      throw new Error("Unauthorized");
    }
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  getAgents: async (): Promise<Agent[]> => {
    try {
      const res = await safeFetch(`${getBaseUrl()}/agents`, { headers: getHeaders() });
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
    });
    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 401) throw new Error("Unauthorized");
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
    });
    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 401) throw new Error("Unauthorized");
      throw new Error(`Failed to start loop: ${errText}`);
    }
    return res.json();
  },

  cancelRun: async (runId: string): Promise<void> => {
    try {
      await safeFetch(`${getBaseUrl()}/runs/${runId}/cancel`, {
        method: 'POST',
        headers: getHeaders(),
      });
    } catch (e) {
      console.warn("Failed to cancel run via backend", e);
    }
  },

  getRuns: async (limit = 10): Promise<RunSummary[]> => {
    const res = await safeFetch(`${getBaseUrl()}/runs?limit=${limit}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch runs');
    return res.json();
  },

  getRun: async (runId: string): Promise<RunDetails> => {
    const res = await safeFetch(`${getBaseUrl()}/runs/${runId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch run details');
    return res.json();
  },

  getStreamUrl: (runId: string): string => {
    return(`${getBaseUrl()}/runs/${runId}/stream`);
  },

  getAuthProviders: async (): Promise<AuthProvider[]> => {
    try {
      const res = await safeFetch(`${getBaseUrl()}/auth/providers`, { headers: getHeaders() });
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      console.warn("Could not fetch auth providers", e);
      return [];
    }
  },

  loginStart: async (providerId: string, redirectUri: string, challenge: string): Promise<{ authorization_url: string }> => {
    const res = await safeFetch(`${getBaseUrl()}/auth/login/${providerId}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256'
      }),
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to start login: ${txt}`);
    }
    return res.json();
  },

  loginFinish: async (code: string, verifier: string): Promise<any> => {
    const res = await safeFetch(`${getBaseUrl()}/auth/callback`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        code,
        code_verifier: verifier
      }),
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to complete login: ${txt}`);
    }
    const data = await res.json();
    if (data.api_key) {
        const current = getSettings();
        saveSettings({ ...current, apiKey: data.api_key });
    }
    return data;
  }
};