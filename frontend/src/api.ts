import type { GtpContent, GtpRequest } from './types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Request failed (HTTP ${res.status})`, body.code);
  }
  return res.json() as Promise<T>;
}

export async function generateGtp(request: GtpRequest): Promise<{ mockMode: boolean; gtp: GtpContent }> {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handle(res);
}

export async function exportDocx(gtp: GtpContent): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/generate/docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gtp }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Export failed (HTTP ${res.status})`, body.code);
  }
  return res.blob();
}
