import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, formatDate, getTenantLabel, setStatus } from './utils.js';
import { openDecisionModal } from './modal.js';

export async function confirmStaffAccessChange(els, nextEnabled) {
  const currentEnabled = state.tenantStaffAccess?.staffAccess?.isEnabled !== false;
  if (currentEnabled === nextEnabled) return true;
  const tenantLabel = getTenantLabel();
  if (!nextEnabled) {
    return openDecisionModal(els, {
      title: "Désactiver l'accès staff",
      subtitle: tenantLabel,
      level: 'warn',
      message: "Tu coupes l'accès staff de ce tenant.",
      impacts: [
        'Le staff ne pourra plus utiliser son accès tenant dédié tant que tu ne le réactives pas.',
        "Si tu fais ça en service, tu crées toi-même l'incident.",
      ],
      confirmLabel: 'Oui, désactiver',
    });
  }
  return true;
}

export async function loadTenantStaffAccess(els, tenantId, renderProvisioningSummary) {
  setStatus(els.staffAccessStatus, 'Chargement accès staff…');
  const payload = await apiFetch(`/superadmin/tenants/${tenantId}/staff-access`);
  state.tenantStaffAccess = payload;
  renderTenantStaffAccess(els);
  setStatus(els.staffAccessStatus, 'Accès staff chargé.', 'ok');
  renderProvisioningSummary();
}

export function renderTenantStaffAccess(els) {
  const tenant = state.tenantStaffAccess?.tenant || null;
  const access = state.tenantStaffAccess?.staffAccess || null;
  const history = Array.isArray(state.tenantStaffAccess?.history) ? state.tenantStaffAccess.history : [];

  els.staffBadge.className = `pill ${access?.isEnabled ? 'ok' : 'warn'}`;
  els.staffBadge.textContent = tenant?.id ? (access?.isEnabled ? 'Accès staff actif' : 'Accès staff désactivé') : 'Accès staff inactif';
  els.reloadStaffAccessBtn.disabled = !tenant?.id;
  els.saveStaffAccessBtn.disabled = !tenant?.id;
  els.rotateStaffTokenBtn.disabled = !tenant?.id;
  els.staffAccessEnabled.checked = access?.isEnabled !== false;
  els.staffAccessEnabled.disabled = !tenant?.id;
  els.staffAccessMode.textContent = access?.mode === 'tenant_token' ? 'Token tenant dédié actif' : 'Fallback token global legacy';
  els.staffRotatedAt.textContent = formatDate(access?.rotatedAt);
  els.staffUpdatedAt.textContent = formatDate(access?.updatedAt);
  if (!state.lastIssuedStaffToken) {
    els.issuedStaffToken.textContent = 'Aucune rotation effectuée dans cette session.';
  }
  els.staffHistoryCount.textContent = String(history.length);
  els.staffHistoryList.innerHTML = history.length ? '' : '<div class="empty">Aucun historique staff pour ce tenant.</div>';
  history.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'history-card';
    item.innerHTML = `
      <div class="history-title">${escapeHtml(row.action || 'action')}</div>
      <div class="history-meta">${escapeHtml(row.adminLabel || 'admin inconnu')} • ${escapeHtml(row.dangerLevel || 'info')} • ${formatDate(row.createdAt)}</div>
    `;
    els.staffHistoryList.appendChild(item);
  });
}

export async function saveTenantStaffAccess(els, loadTenants, reloadTenantStaffAccess) {
  if (!state.selectedTenantId) return;
  const confirmed = await confirmStaffAccessChange(els, els.staffAccessEnabled.checked);
  if (!confirmed) {
    setStatus(els.staffAccessStatus, 'Changement annulé.', 'error');
    return;
  }
  setStatus(els.staffAccessStatus, 'Enregistrement accès staff…');
  const payload = await apiFetch(`/superadmin/tenants/${state.selectedTenantId}/staff-access`, {
    method: 'PATCH',
    body: JSON.stringify({ isEnabled: els.staffAccessEnabled.checked }),
  });
  state.tenantStaffAccess = {
    ok: true,
    tenant: payload.tenant || state.tenantStaffAccess?.tenant || null,
    staffAccess: payload.staffAccess || null,
    history: state.tenantStaffAccess?.history || [],
  };
  renderTenantStaffAccess(els);
  setStatus(els.staffAccessStatus, 'Accès staff enregistré.', 'ok');
  await Promise.all([loadTenants(), reloadTenantStaffAccess(state.selectedTenantId)]);
}

export async function rotateTenantStaffToken(els, loadTenants, reloadTenantStaffAccess) {
  if (!state.selectedTenantId) return;
  const customToken = els.customStaffToken.value.trim();
  const confirmed = await openDecisionModal(els, {
    title: 'Rotation token staff',
    subtitle: getTenantLabel(),
    level: 'danger',
    message: 'La rotation tue immédiatement l’ancien token staff.',
    impacts: [
      'L’ancien token devient inutilisable dès validation.',
      'Le nouveau token doit être redonné proprement au staff concerné.',
      customToken ? 'Tu imposes un token personnalisé. Vérifie qu’il a été communiqué sans erreur.' : 'Un nouveau token fort sera généré automatiquement.',
    ],
    confirmLabel: 'Oui, faire la rotation',
  });
  if (!confirmed) return;
  setStatus(els.staffAccessStatus, 'Rotation token staff…');
  const payload = await apiFetch(`/superadmin/tenants/${state.selectedTenantId}/staff-access/rotate`, {
    method: 'POST',
    body: JSON.stringify({ nextToken: customToken || undefined }),
  });
  state.lastIssuedStaffToken = payload.issuedToken || '';
  els.issuedStaffToken.textContent = payload.issuedToken || 'Token non renvoyé';
  els.customStaffToken.value = '';
  state.tenantStaffAccess = {
    ok: true,
    tenant: payload.tenant || state.tenantStaffAccess?.tenant || null,
    staffAccess: payload.staffAccess || null,
    history: state.tenantStaffAccess?.history || [],
  };
  renderTenantStaffAccess(els);
  setStatus(els.staffAccessStatus, 'Token staff roté. L’ancien est mort.', 'ok');
  await Promise.all([loadTenants(), reloadTenantStaffAccess(state.selectedTenantId)]);
}
