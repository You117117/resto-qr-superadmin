import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, setStatus, slugifyLocal } from './utils.js';

export function toggleCreateTenantPanel(els, forceOpen = null) {
  const shouldOpen = forceOpen == null ? els.createTenantPanel.classList.contains('hidden') : Boolean(forceOpen);
  els.createTenantPanel.classList.toggle('hidden', !shouldOpen);
  if (shouldOpen) setStatus(els.createTenantStatus, '');
}

export function renderProvisioningDefaults(els) {
  const defaults = state.provisioningDefaults?.provisioningDefaults || {};
  const templates = Array.isArray(defaults.availableMenuTemplates) ? defaults.availableMenuTemplates : [];
  const current = defaults.defaultMenuTemplateCode || templates[0]?.code || '';
  els.createTenantTemplate.innerHTML = templates.length
    ? templates.map((tpl) => `<option value="${escapeHtml(tpl.code)}" ${tpl.code === current ? 'selected' : ''}>${escapeHtml(tpl.name || tpl.code)}</option>`).join('')
    : '<option value="">Aucun template disponible</option>';
}

export function resetCreateTenantForm(els, useDefaults = true) {
  const defaults = state.provisioningDefaults?.provisioningDefaults || {};
  els.createTenantName.value = '';
  els.createTenantSubdomain.value = '';
  els.createTenantSlug.value = '';
  els.createTenantTimezone.value = useDefaults ? (defaults.timezone || 'Europe/Brussels') : 'Europe/Brussels';
  els.createTenantBusinessCloseHour.value = String(useDefaults ? (defaults.businessCloseHour ?? 3) : 3);
  els.createTenantStatusSelect.value = useDefaults ? (defaults.status || 'onboarding') : 'onboarding';
  els.createTenantInitialTableCount.value = String(useDefaults ? (defaults.initialTableCount ?? 0) : 0);
  els.createTenantStaffEnabled.checked = useDefaults ? (defaults.staffAccessEnabled !== false) : true;
  els.createTenantNotes.value = '';
  renderProvisioningDefaults(els);
}

export async function loadProvisioningDefaults(els) {
  const payload = await apiFetch('/superadmin/provisioning/defaults');
  state.provisioningDefaults = payload;
  renderProvisioningDefaults(els);
  if (!els.createTenantName.value) resetCreateTenantForm(els, true);
}

export function buildCreateTenantPayload(els) {
  const name = els.createTenantName.value.trim();
  const slug = slugifyLocal(els.createTenantSlug.value || name);
  const subdomain = slugifyLocal(els.createTenantSubdomain.value || slug || name);
  if (!name) throw new Error('tenant_name_required');
  if (!subdomain) throw new Error('tenant_subdomain_invalid');
  return {
    name,
    slug,
    subdomain,
    timezone: els.createTenantTimezone.value.trim() || 'Europe/Brussels',
    businessCloseHour: Number(els.createTenantBusinessCloseHour.value || 3),
    status: els.createTenantStatusSelect.value || 'onboarding',
    notesInternal: els.createTenantNotes.value.trim(),
    menuTemplateCode: els.createTenantTemplate.value || '',
    staffAccessEnabled: els.createTenantStaffEnabled.checked,
    initialTableCount: Number(els.createTenantInitialTableCount.value || 0),
  };
}

export async function createTenantFromUi(els, loadTenants, loadTenantWorkspace, renderTenantList) {
  const payload = buildCreateTenantPayload(els);
  setStatus(els.createTenantStatus, 'Création tenant…');
  const created = await apiFetch('/superadmin/tenants', { method: 'POST', body: JSON.stringify(payload) });
  await loadTenants();
  state.selectedTenantId = created?.tenant?.id || state.selectedTenantId;
  await loadTenantWorkspace(state.selectedTenantId);
  renderTenantList();
  toggleCreateTenantPanel(els, false);
  resetCreateTenantForm(els, true);
  setStatus(els.globalStatus, `Tenant créé : ${created?.tenant?.name || created?.tenant?.id}.`, 'ok');
  setStatus(els.createTenantStatus, 'Tenant créé.', 'ok');
}

export function renderProvisioningSummary(els) {
  const tenant = state.tenantSettings?.tenant || state.tenants.find((row) => row.id === state.selectedTenantId) || null;
  const settings = state.tenantSettings?.settings || null;
  const access = state.tenantStaffAccess?.staffAccess || null;
  const tables = Array.isArray(state.tenantTables?.tables) ? state.tenantTables.tables.filter((row) => !row.archivedAt) : [];
  const qrTables = Array.isArray(state.qrCenter?.qrCenter?.tables) ? state.qrCenter.qrCenter.tables : [];
  const readyQr = qrTables.filter((row) => row.qrStatus === 'ready').length;
  const categories = Array.isArray(state.catalog?.categories) ? state.catalog.categories : [];
  const checks = [
    { key: 'settings', label: 'Settings', ok: Boolean(settings && tenant?.id), note: settings ? `${settings.timezone || 'Europe/Brussels'} • fermeture ${settings.businessCloseHour ?? 3}h` : 'Réglages tenant non chargés' },
    { key: 'tables', label: 'Tables', ok: tables.length > 0, note: tables.length ? `${tables.length} table(s) pilotables` : 'Aucune table créée' },
    { key: 'qr', label: 'QR', ok: readyQr > 0 && readyQr === qrTables.filter((row) => row.isActive).length, note: qrTables.length ? `${readyQr}/${qrTables.length} QR prêts` : 'Aucun QR exploitable' },
    { key: 'staff', label: 'Accès staff', ok: Boolean(access?.isEnabled), note: access ? (access.isEnabled ? 'Accès staff activé' : 'Accès staff coupé') : 'Accès staff non chargé' },
    { key: 'catalog', label: 'Catalogue', ok: categories.length > 0, note: categories.length ? `${categories.length} catégorie(s) présentes` : 'Catalogue vide' },
  ];
  els.provisioningSummary.innerHTML = checks.map((entry) => `<div class="provision-card"><div class="space-between"><strong>${escapeHtml(entry.label)}</strong><span class="pill ${entry.ok ? 'ok' : 'warn'}">${entry.ok ? 'OK' : 'À faire'}</span></div><div class="muted">${escapeHtml(entry.note)}</div></div>`).join('');
  const remaining = checks.filter((entry) => !entry.ok).map((entry) => entry.label);
  setStatus(
    els.provisioningStatus,
    tenant?.id
      ? (remaining.length ? `Tenant incomplet : ${remaining.join(', ')}.` : 'Tenant provisionné correctement sur les points clés.')
      : 'Sélectionne un tenant pour lire le provisioning.',
    tenant?.id ? (remaining.length ? 'error' : 'ok') : ''
  );
  [
    els.provisioningGoSettingsBtn,
    els.provisioningGoTablesBtn,
    els.provisioningGoQrBtn,
    els.provisioningGoStaffBtn,
    els.provisioningGoCatalogBtn,
    els.refreshProvisioningBtn,
  ].forEach((btn) => { btn.disabled = !tenant?.id; });
}
