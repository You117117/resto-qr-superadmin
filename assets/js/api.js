import { state } from './state.js';

export function getApiUrl(path) {
  const base = String(state.apiBase || '').replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-token': state.adminToken,
  };
}

export async function apiFetch(path, options = {}) {
  const response = await fetch(getApiUrl(path), {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = { ok: false, error: text || 'invalid_json' };
  }

  if (!response.ok) {
    throw new Error(data?.error || `http_${response.status}`);
  }

  return data;
}
