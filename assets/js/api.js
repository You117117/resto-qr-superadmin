import { state } from './state.js';

export function getApiUrl(path) {
  const base = state.apiBase || '';
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.adminToken) {
    headers['x-superadmin-token'] = state.adminToken;
  }
  return headers;
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(getApiUrl(path), {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok || data?.ok === false) {
    const error = data?.error || `http_${res.status}`;
    throw new Error(error);
  }

  return data;
}
