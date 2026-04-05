import { state, DEFAULT_COLOR } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, getTenantLabel, setStatus, updateColorPreview } from './utils.js';
import { openDecisionModal } from './modal.js';

export function diffSettingsPayload(nextPayload) {
  const current = state.tenantSettings?.settings || {};
  const currentFlags = current.operationsFlags || {};
  const nextFlags = nextPayload.operationsFlags || {};
  const changes = [];
  const push = (key, label, from, to) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ key, label, from, to });
  };
  push('restaurantName', 'Nom restaurant', current.restaurantName || '', nextPayload.restaurantName || '');
  push('status', 'Statut tenant', current.status || 'draft', nextPayload.status || 'draft');
  push('timezone', 'Timezone', current.timezone || 'Europe/Brussels', nextPayload.timezone || 'Europe/Brussels');
  push('businessCloseHour', 'Fermeture métier', current.businessCloseHour ?? 3, nextPayload.businessCloseHour ?? 3);
  push('brandingName', 'Branding affiché', current.brandingName || '', nextPayload.brandingName || '');
  push('brandingLogoUrl', 'Logo URL', current.brandingLogoUrl || '', nextPayload.brandingLogoUrl || '');
  push('brandingPrimaryColor', 'Couleur principale', current.brandingPrimaryColor || DEFAULT_COLOR, nextPayload.brandingPrimaryColor || DEFAULT_COLOR);
  push('qrOrderingEnabled', 'QR ordering', currentFlags.qrOrderingEnabled !== false, nextFlags.qrOrderingEnabled !== false);
  push('clientMenuEnabled', 'Menu client visible', currentFlags.clientMenuEnabled !== false, nextFlags.clientMenuEnabled !== false);
  push('takeawayEnabled', 'Takeaway', currentFlags.takeawayEnabled !== false, nextFlags.takeawayEnabled !== false);
  push('demoMode', 'Mode démo', currentFlags.demoMode === true, nextFlags.demoMode === true);
  return changes;
}

export async function confirmSettingsChange(els, nextPayload) {
  const changes = diffSettingsPayload(nextPayload);
  if (!changes.length) {
    setStatus(els.settingsStatus, 'Aucun changement détecté.', 'error');
    return false;
  }
  const tenantLabel = getTenantLabel();
  const statusChange = changes.find((item) => item.key === 'status');
  const disablingClient = changes.find((item) => ['qrOrderingEnabled', 'clientMenuEnabled'].includes(item.key) && item.to === false);
  const scheduleChange = changes.find((item) => ['timezone', 'businessCloseHour'].includes(item.key));
  const impactful = changes.map((item) => `${item.label} : ${String(item.from)} → ${String(item.to)}`);
  if (statusChange && ['suspended', 'archived'].includes(String(statusChange.to))) {
    return openDecisionModal(els, {
      title: 'Suspendre ou archiver un tenant',
      subtitle: tenantLabel,
      level: 'danger',
      message: "Tu modifies un statut structurant. Ce n'est pas un simple réglage cosmétique.",
      impacts: [
        `Le tenant ${tenantLabel} passe en statut ${statusChange.to}.`,
        'Les équipes peuvent comprendre cela comme un arrêt d’exploitation ou un tenant sorti du circuit.',
        'L’action sera visible dans l’audit admin avec un niveau de danger élevé.',
        ...impactful,
      ],
      confirmLabel: `Oui, passer en ${statusChange.to}`,
    });
  }
  if (disablingClient) {
    return openDecisionModal(els, {
      title: 'Modifier la disponibilité côté client',
      subtitle: tenantLabel,
      level: 'danger',
      message: 'Tu es en train de couper une capacité visible pour le restaurant ou pour ses clients.',
      impacts: [
        disablingClient.key === 'qrOrderingEnabled' ? 'Le flux QR ordering peut devenir indisponible.' : 'Le menu client peut ne plus être visible.',
        'Ce changement peut générer immédiatement des tickets de support si fait au mauvais moment.',
        ...impactful,
      ],
      confirmLabel: 'Oui, appliquer ce changement',
    });
  }
  if (scheduleChange) {
    return openDecisionModal(els, {
      title: 'Modifier un réglage métier structurant',
      subtitle: tenantLabel,
      level: 'warn',
      message: 'Timezone et heure de fermeture impactent la lecture métier des services et du jour d’exploitation.',
      impacts: impactful,
      confirmLabel: 'Confirmer les réglages',
    });
  }
  return true;
}

export function buildSettingsPayload(els) {
  return {
    restaurantName: els.restaurantName.value.trim(),
    status: els.tenantStatusSelect.value,
    timezone: els.tenantTimezone.value.trim(),
    businessCloseHour: Number(els.businessCloseHour.value),
    notesInternal: els.notesInternal.value.trim(),
    brandingName: els.brandingName.value.trim(),
    brandingLogoUrl: els.brandingLogoUrl.value.trim(),
    brandingPrimaryColor: els.brandingPrimaryColor.value,
    operationsFlags: {
      qrOrderingEnabled: els.flagQrOrderingEnabled.checked,
      clientMenuEnabled: els.flagClientMenuEnabled.checked,
      takeawayEnabled: els.flagTakeawayEnabled.checked,
      demoMode: els.flagDemoMode.checked,
    },
  };
}

export async function loadTenantSettings(els, tenantId, renderProvisioningSummary) {
  setStatus(els.settingsStatus, 'Chargement settings…');
  const payload = await apiFetch(`/superadmin/tenants/${tenantId}/settings`);
  state.tenantSettings = payload;
  renderTenantSettings(els, renderProvisioningSummary);
  setStatus(els.settingsStatus, 'Settings chargés.', 'ok');
}

export function renderTenantSettings(els, renderProvisioningSummary = () => {}) {
  const tenant = state.tenantSettings?.tenant || null;
  const settings = state.tenantSettings?.settings || null;
  const history = Array.isArray(state.tenantSettings?.history) ? state.tenantSettings.history : [];

  els.tenantTitle.textContent = tenant?.name || tenant?.slug || 'Tenant';
  els.tenantMeta.textContent = `${tenant?.subdomain || tenant?.slug || tenant?.id || ''} • timezone ${escapeHtml(settings?.timezone || 'Europe/Brussels')} • fermeture ${settings?.businessCloseHour ?? 3}h`;
  els.settingsBadge.className = `pill ${tenant?.id ? 'ok' : 'warn'}`;
  els.settingsBadge.textContent = tenant?.id ? 'Settings prêts' : 'Settings inactifs';
  if (!tenant?.id) {
    els.staffBadge.className = 'pill warn';
    els.staffBadge.textContent = 'Accès staff inactif';
  }
  els.reloadSettingsBtn.disabled = !tenant?.id;
  els.saveSettingsBtn.disabled = !tenant?.id;

  renderProvisioningSummary();
  if (!settings) return;

  els.restaurantName.value = settings.restaurantName || '';
  els.tenantStatusSelect.value = settings.status || 'draft';
  els.tenantTimezone.value = settings.timezone || 'Europe/Brussels';
  els.businessCloseHour.value = settings.businessCloseHour ?? 3;
  els.notesInternal.value = settings.notesInternal || '';
  els.brandingName.value = settings.brandingName || '';
  els.brandingLogoUrl.value = settings.brandingLogoUrl || '';
  updateColorPreview(els, settings.brandingPrimaryColor || DEFAULT_COLOR);
  const flags = settings.operationsFlags || {};
  els.flagQrOrderingEnabled.checked = flags.qrOrderingEnabled !== false;
  els.flagClientMenuEnabled.checked = flags.clientMenuEnabled !== false;
  els.flagTakeawayEnabled.checked = flags.takeawayEnabled !== false;
  els.flagDemoMode.checked = flags.demoMode === true;

  els.historyCount.textContent = String(history.length);
  els.historyList.innerHTML = history.length ? '' : '<div class="empty">Aucun historique settings pour ce tenant.</div>';
  history.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'history-card';
    item.innerHTML = `
      <div class="history-title">${escapeHtml(row.action || 'action')}</div>
      <div class="history-meta">${escapeHtml(row.adminLabel || 'admin inconnu')} • ${escapeHtml(row.dangerLevel || 'info')} • ${row.createdAt ? new Intl.DateTimeFormat('fr-BE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.createdAt)) : 'jamais'}</div>
    `;
    els.historyList.appendChild(item);
  });
}

export async function saveTenantSettings(els, loadTenants, loadTenantSettingsReload) {
  if (!state.selectedTenantId) return;
  const nextPayload = buildSettingsPayload(els);
  const confirmed = await confirmSettingsChange(els, nextPayload);
  if (!confirmed) {
    setStatus(els.settingsStatus, 'Changement annulé.', 'error');
    return;
  }
  setStatus(els.settingsStatus, 'Enregistrement settings…');
  const payload = await apiFetch(`/superadmin/tenants/${state.selectedTenantId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(nextPayload),
  });
  state.tenantSettings = {
    ok: true,
    tenant: payload.tenant || state.tenantSettings?.tenant || null,
    settings: payload.settings || null,
    history: state.tenantSettings?.history || [],
  };
  setStatus(els.settingsStatus, 'Settings enregistrés.', 'ok');
  await Promise.all([loadTenants(), loadTenantSettingsReload(state.selectedTenantId)]);
}
