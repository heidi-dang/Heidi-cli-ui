import { Agent, LoopRequest, RunDetails, RunRequest, RunResponse, RunSummary, SettingsState } from '../types';

const DEFAULT_BASE_URL = 'http://localhost:7777';

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
  const { apiKey } = getSettings();
  const key = customApiKey !== undefined ? customApiKey : apiKey;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
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
    // Ensure payload matches strict requirement: { prompt, executor, workdir }
    // We add persona as default per instructions
    const body = {
      prompt: payload.prompt,
      executor: payload.executor,
      workdir: payload.workdir || null,
      persona: payload.persona || 'default',
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
    // Ensure payload matches strict requirement: { task, executor, max_retries, workdir }
    const body = {
      task: payload.task,
      executor: payload.executor,
      max_retries: payload.max_retries,
      workdir: payload.workdir || null,
      persona: payload.persona || 'default',
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
    const res = await fetch(`${getBaseUrl()}/runs/${runId}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    // We don't throw if it fails, just try best effort
    if (!res.ok) {
        console.warn("Failed to cancel run via backend");
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
  }
};