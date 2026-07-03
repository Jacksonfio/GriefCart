import { AIService } from './AIService';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) return `/api${normalizedPath}`;
  if (API_BASE.includes('/api') || API_BASE.endsWith('/v1')) return `${API_BASE}${normalizedPath}`;
  return `${API_BASE}/api${normalizedPath}`;
}

async function request<T>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const token = localStorage.getItem('griefcart_token');
  const { method = 'GET', body, headers = {} } = opts;
  const res = await fetch(buildApiUrl(path), {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const Auth = {
  async login(email: string, password: string) {
    const res = await fetch(buildApiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('griefcart_token', data.token);
    localStorage.setItem('griefcart_user', JSON.stringify({ userId: data.userId, email: data.email }));
    return data;
  },
  async register(email: string, password: string, name?: string) {
    const res = await fetch(buildApiUrl('/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    localStorage.setItem('griefcart_token', data.token);
    localStorage.setItem('griefcart_user', JSON.stringify({ userId: data.userId, email: data.email }));
    return data;
  },
  async demoLogin() {
    const res = await fetch(buildApiUrl('/auth/demo'), { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Demo login failed');
    localStorage.setItem('griefcart_token', data.token);
    localStorage.setItem('griefcart_user', JSON.stringify({ userId: data.userId, email: data.email }));
    return data;
  },
  handleRedirect(): void {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token=')) return;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const token = params.get('id_token') || params.get('access_token');
    if (token) {
      localStorage.setItem('griefcart_token', token);
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        localStorage.setItem('griefcart_user', JSON.stringify({
          userId: payload.sub,
          email: payload.email || payload['cognito:username'] || '',
          name: payload.name || '',
        }));
      } catch {}
      window.location.hash = '';
    }
  },
  isAuthenticated(): boolean {
    const token = localStorage.getItem('griefcart_token');
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch { return false; }
  },
  getUser(): { userId: string; email: string } | null {
    const stored = localStorage.getItem('griefcart_user');
    if (stored) {
      try { return JSON.parse(stored); } catch { /* ignore */ }
    }
    const token = localStorage.getItem('griefcart_token');
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return { userId: payload.userId || payload.sub, email: payload.email || '' };
    } catch { return null; }
  },
  logout(): void {
    localStorage.removeItem('griefcart_token');
    localStorage.removeItem('griefcart_user');
    window.location.href = '/';
  },
};

export async function uploadDocument(file: File, category: string) {
  const buffer = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return request('/documents/upload', {
    method: 'POST',
    body: { fileName: file.name, contentType: file.type, fileData: base64, category },
  });
}

export async function getDocuments() {
  return request<{ documents: import('@/types').Document[]; count: number }>('/documents');
}

export async function getDocument(id: string) {
  return request<import('@/types').Document>(`/documents/${id}`);
}

export async function getFinancialTwin() {
  return request<{ twin: import('@/types').FinancialTwin | null; status: string }>('/twin');
}

export async function queryTwin(question: string) {
  return request<{ answer: string; twinGeneratedAt: string }>('/twin/query', { method: 'POST', body: { question } });
}

export async function refreshTwin() {
  return request<{ status: string; twinId: string }>('/twin/refresh', { method: 'POST' });
}

export async function getContinuityScore() {
  return request<import('@/types').ContinuityScore>('/continuity-score');
}

export async function getTrustedPersons() {
  return request<{ trustedPersons: import('@/types').TrustedPerson[] }>('/trusted-persons');
}

export async function addTrustedPerson(person: Partial<import('@/types').TrustedPerson>) {
  return request<{ personId: string; status: string }>('/trusted-persons', { method: 'POST', body: person });
}

export async function updateTrustedPerson(id: string, person: Partial<import('@/types').TrustedPerson>) {
  return request<{ updated: string }>(`/trusted-persons/${id}`, { method: 'PUT', body: person });
}

export async function deleteTrustedPerson(id: string) {
  return request<{ deleted: string }>(`/trusted-persons/${id}`, { method: 'DELETE' });
}

export async function getContinuityPlan() {
  return request<{ plan: import('@/types').ContinuityPlan | null }>('/continuity-plan');
}

export async function generateContinuityPlan() {
  return request<import('@/types').ContinuityPlan>('/continuity-plan/generate', { method: 'POST' });
}

export async function sendChatMessage(message: string, history: import('@/types').ChatMessage[] = []) {
  return AIService.chat(message, history);
}

export async function runDetectiveScan() {
  return request<import('@/types').DetectiveResult>('/detective/scan', { method: 'POST' });
}

export async function getRecoveryGuide() {
  return request<import('@/types').RecoveryGuide>('/recovery/guide');
}

export async function getLegacyAnswers() {
  return request<import('@/types').LegacyAnswers>('/legacy');
}

export async function saveLegacyAnswers(answers: Partial<import('@/types').LegacyAnswers>) {
  return request<{ legacyId: string; status: string; updatedAt: string }>('/legacy', { method: 'POST', body: answers });
}

export async function generateLegacyDocument(legacyId?: string) {
  return request<import('@/types').LegacyDocument>('/legacy/generate', { method: 'POST', body: { legacyId } });
}

export async function activateEmergency(code?: string) {
  return request<{ status: string; message: string; notifiedPersons: number }>('/emergency/activate', {
    method: 'POST',
    body: { code: code ?? '' },
  });
}

export async function getEmergencyStatus() {
  return request<{
    verifiedTrustedPersons: number;
    totalTrustedPersons: number;
    hasContinuityPlan: boolean;
    emergencyReady: boolean;
  }>('/emergency/status');
}

export async function getProfile() {
  return request<{ userId: string; email: string; name: string; createdAt: string; lastLoginAt: string; loginCount: number; continuityScore: number | null; twinStatus: string; mfaEnabled: boolean }>('/auth/me');
}
