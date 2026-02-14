import { Agent, LoopRequest, RunDetails, RunRequest, RunResponse, RunSummary, SettingsState, AuthProvider, AuthStatus, IntegrationStatus } from '../types';

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

// Helper for requests with auth
const safeFetch = async (url: string, options: RequestInit = {}) => {
  const res = await fetch(url, {
    ...options,
    credentials: 'include', // Ensure cookies are sent (CRITICAL for Auth)
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

  // Auth Methods
  getAuthStatus: async (): Promise<AuthStatus> => {
    try {
      const res = await safeFetch(`${getBaseUrl()}/auth/status`, { headers: getHeaders() });
      if (res.status === 401) return { authenticated: false };
      if (!res.ok) return { authenticated: false };
      return res.json();
    } catch (e) {
      return { authenticated: false };
    }
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

  getLoginUrl: async (providerId: string): Promise<string> => {
    // We call the backend to get the redirect URL
    const res = await safeFetch(`${getBaseUrl()}/auth/login/${providerId}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to get login URL: ${txt}`);
    }
    const data = await res.json();
    return data.auth_url || data.authorization_url;
  },

  loginFinish: async (code: string, verifier: string): Promise<void> => {
      const res = await safeFetch(`${getBaseUrl()}/auth/callback`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ code, verifier })
      });
      if (!res.ok) {
          const text = await res.text();
          throw new Error(text || 'Login failed');
      }
  },

  logout: async (): Promise<void> => {
    await safeFetch(`${getBaseUrl()}/auth/logout`, {
        method: 'POST',
        headers: getHeaders()
    });
  },

  // Integration Methods
  checkOpenCodeStatus: async (): Promise<IntegrationStatus> => {
      try {
          const res = await safeFetch(`${getBaseUrl()}/opencode/status`, { headers: getHeaders() });
          if (!res.ok) return { provider: 'opencode', connected: false, details: 'Status check failed' };
          return res.json();
      } catch (e) {
          return { provider: 'opencode', connected: false, details: 'Backend unreachable' };
      }
  },

  // Agent & Run Methods
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
    const base = `${getBaseUrl()}/runs/${runId}/stream`;
    const { apiKey } = getSettings();
    if (apiKey) {
        // Append API Key for EventSource support (which cannot set headers)
        return `${base}?key=${encodeURIComponent(apiKey)}`;
    }
    return base;
  },
};