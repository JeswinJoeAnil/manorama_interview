/**
 * API service — all backend communication goes through here.
 */

import type {
  GenerateRequest,
  GenerateResponse,
  HealthResponse,
  BatchValidateResponse,
  ValidateItem,
} from '../types';

// In dev, Vite proxies /api to the backend (see vite.config.ts).
// In production, a reverse proxy in front of the app should do the same.
const API_BASE = '/api';

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    
    if (!response.ok) {
      const body = await response.text();
      let message: string;
      try {
        const json = JSON.parse(body);
        message = json.detail || json.message || body;
      } catch {
        message = body || `HTTP ${response.status}`;
      }
      throw new ApiError(response.status, message);
    }
    
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof TypeError) {
      throw new ApiError(0, 'Cannot connect to backend. Is the server running on port 8000?');
    }
    throw error;
  }
}

export async function checkHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

export async function generateTickers(
  req: GenerateRequest
): Promise<GenerateResponse> {
  return request<GenerateResponse>('/tickers/generate', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function validateTickers(
  items: ValidateItem[]
): Promise<BatchValidateResponse> {
  return request<BatchValidateResponse>('/tickers/validate', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}
