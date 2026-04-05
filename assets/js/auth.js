import { state } from './state.js';
import { apiFetch } from './api.js';
import { setStatus } from './utils.js';

export function renderSessionInfo(els) {
  if (state.admin && state.adminToken) {
    const label = state.admin.fullName || state.admin.email || state.admin.authMode || 'superadmin';
    const email = state.admin.email ? ` • ${state.admin.email}` : '';
    els.sessionInfo.textContent = `Connecté : ${label}${email}`;
    els.authBtn.textContent = 'Déconnexion';
    return;
  }
  els.sessionInfo.textContent = 'Pas connecté.';
  els.authBtn.textContent = 'Connexion';
}

export function logout(els, resetProtectedState) {
  state.admin = null;
  state.adminToken = '';
  localStorage.removeItem('superadmin_admin_token');
  els.adminPassword.value = '';
  resetProtectedState();
  renderSessionInfo(els);
  setStatus(els.globalStatus, 'Session fermée.', 'ok');
}

export async function login(els, afterLogin) {
  state.apiBase = els.apiBase.value.trim();
  state.adminEmail = els.adminEmail.value.trim();
  const password = els.adminPassword.value;
  localStorage.setItem('superadmin_api_base', state.apiBase);
  localStorage.setItem('superadmin_admin_email', state.adminEmail);
  setStatus(els.globalStatus, 'Connexion en cours…');
  const payload = await apiFetch('/superadmin/login', {
    method: 'POST',
    body: JSON.stringify({ email: state.adminEmail, password }),
    headers: { 'Content-Type': 'application/json' },
  });
  state.adminToken = payload.token || '';
  localStorage.setItem('superadmin_admin_token', state.adminToken);
  state.admin = payload.admin || null;
  els.adminPassword.value = '';
  renderSessionInfo(els);
  setStatus(els.globalStatus, 'Connexion valide.', 'ok');
  await afterLogin();
}
