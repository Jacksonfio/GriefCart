type AIRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) return `/api${normalizedPath}`;
  if (API_BASE.includes('/api')) return `${API_BASE}${normalizedPath}`;
  if (API_BASE.endsWith('/v1')) return `${API_BASE}${normalizedPath}`;
  return `${API_BASE}/api${normalizedPath}`;
}

async function request<T>(path: string, opts: AIRequestOptions = {}): Promise<T> {
  const token = localStorage.getItem('griefcart_token');
  const res = await fetch(buildApiUrl(path), {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'AI request failed');
  }

  return data as T;
}

export const AIService = {
  async chat(message: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
    return request<{ message: string; timestamp: string; hasTwin: boolean }>('/chat', {
      method: 'POST',
      body: { message, history },
    });
  },

  async analyzeTwin(question: string) {
    return request<{ answer: string; twinGeneratedAt: string }>('/ai/twin', {
      method: 'POST',
      body: { question },
    });
  },

  async summarizePlan(payload: Record<string, unknown>) {
    return request<{ summary: string }>('/ai/plan', {
      method: 'POST',
      body: payload,
    });
  },
};
