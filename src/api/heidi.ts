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
  
  // NOTE: Backend currently has no auth. Sending this header might cause CORS issues if not allowed.
  // Uncomment when backend supports X-Heidi-Key.
  /*
  const { apiKey } = getSettings();
  const key = customApiKey !== undefined ? customApiKey : apiKey;
  if (key) {
    headers['X-Heidi-Key'] = key;
  }
  */
  
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

export const api = {
  health: async (customBaseUrl?: string, customApiKey?: string): Promise<{ status: string }> => {
    const url = getBaseUrl(customBaseUrl);
    const headers = getHeaders(customApiKey);
    const res = await fetch(`${url}/health`, { headers });
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  getAgents: async (): Promise<Agent[]> => {
    try {
      const res = await fetch(`${getBaseUrl()}/agents`, { headers: getHeaders() });
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      console.warn("Could not fetch agents", e);
      return [];
    }
  },

  startRun: async (payload: RunRequest): Promise<RunResponse> => {
    // Spec: POST /run { "prompt": "text", "executor": "copilot", "workdir": null }
    const body = {
      prompt: payload.prompt,
      executor: payload.executor || 'copilot',
      workdir: payload.workdir || null,
      // Optional: Include dry_run only if true
      ...(payload.dry_run ? { dry_run: true } : {})
    };

    const res = await fetch(`${getBaseUrl()}/run`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to start run: ${errText}`);
    }
    return res.json();
  },

  startLoop: async (payload: LoopRequest): Promise<RunResponse> => {
    // Spec: POST /loop { "task": "text", "executor": "copilot", "max_retries": 2, "workdir": null }
    const body = {
      task: payload.task,
      executor: payload.executor || 'copilot',
      max_retries: payload.max_retries ?? 2,
      workdir: payload.workdir || null,
      // Optional: Include dry_run only if true
      ...(payload.dry_run ? { dry_run: true } : {})
    };

    const res = await fetch(`${getBaseUrl()}/loop`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to start loop: ${errText}`);
    }
    return res.json();
  },

  cancelRun: async (runId: string): Promise<void> => {
    // Best effort cancellation
    try {
      await fetch(`${getBaseUrl()}/runs/${runId}/cancel`, {
        method: 'POST',
        headers: getHeaders(),
      });
    } catch (e) {
      console.warn("Failed to cancel run via backend", e);
    }
  },

  getRuns: async (limit = 10): Promise<RunSummary[]> => {
    const res = await fetch(`${getBaseUrl()}/runs?limit=${limit}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch runs');
    return res.json();
  },

  getRun: async (runId: string): Promise<RunDetails> => {
    const res = await fetch(`${getBaseUrl()}/runs/${runId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch run details');
    return res.json();
  },

  getStreamUrl: (runId: string): string => {
    return(`${getBaseUrl()}/runs/${runId}/stream`);
  },

  getAuthProviders: async (): Promise<AuthProvider[]> => {
    try {
      const res = await fetch(`${getBaseUrl()}/auth/providers`, { headers: getHeaders() });
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      console.warn("Could not fetch auth providers", e);
      return [];
    }
  },

  loginStart: async (providerId: string, redirectUri: string, challenge: string): Promise<{ authorization_url: string }> => {
    const res = await fetch(`${getBaseUrl()}/auth/login/${providerId}`, {
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
    const res = await fetch(`${getBaseUrl()}/auth/callback`, {
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