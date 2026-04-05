import { state } from './state.js';
import { getEls } from './dom.js';
import {
  setStatus,
  escapeHtml,
  formatDate,
  updateColorPreview,
  describeApiError,
  getTenantLabel,
  slugifyLocal,
  setPlatformBadge,
} from './utils.js';
import { getApiUrl, apiFetch } from './api.js';
import { openDecisionModal, closeDecisionModal } from './modal.js';
import { renderSessionInfo, login, logout } from './auth.js';

const els = getEls();

function renderOverview() {
  const overview = state.overview || {};
  const counts = overview.counts || {};
  const platform = overview.platform || {};
  const incidents = overview.incidents || {};
  const audits = overview.audits || {};
  const shortcuts = overview.shortcuts || {};

  setPlatformBadge(els.platformApiBadge, `API ${platform.apiStatus || 'inconnue'}`, platform.apiStatus || 'warn');
  setPlatformBadge(els.platformDbBadge, `DB ${platform.dbStatus || 'inconnue'}`, platform.dbStatus || 'warn');
  setPlatformBadge(els.platformSseBadge, `SSE ${platform.sseStatus || 'inconnu'}`, platform.sseStatus || 'warn');

  els.metricTenantsTotal.textContent = String(counts.tenantsTotal || 0);
  els.metricTenantsNote.textContent = `${counts.tenantsActive || 0} actifs / ${counts.tenantsInactive || 0} inactifs`;
  els.metricTablesTotal.textContent = String(counts.tablesTotal || 0);
  els.metricTablesNote.textContent = `${counts.auditsRecent || 0} audits récents • ${counts.incidentsRecent || 0} incidents récents`;
  els.metricSessionsOpen.textContent = String(counts.sessionsOpen || 0);
  els.metricSessionsNote.textContent = `${counts.sessionsInProgress || 0} en cours sur ${counts.sessionsTotal || 0} session(s)`;
  els.metricStaffEnabled.textContent = String(counts.staffAccessEnabled || 0);
  els.metricStaffNote.textContent = `${counts.staffDedicated || 0} dédiés / ${counts.staffAccessTotal || 0} total`;

  const sev = incidents.severityCounts || {};
  els.incidentCounts.textContent = `${incidents.items?.length || 0} • info ${sev.info || 0} • warn ${sev.warn || 0} • error ${sev.error || 0}`;
  els.incidentList.innerHTML = (incidents.items || []).length ? '' : '<div class="empty">Aucun incident récent exploitable.</div>';
  (incidents.items || []).forEach((row) => {
    const item = document.createElement('div');
    item.className = 'overview-item';
    item.innerHTML = `
      <div class="space-between"><strong>${escapeHtml(row.eventCode || 'incident')}</strong><span class="pill ${row.severity === 'error' ? 'danger' : row.severity === 'warn' ? 'warn' : 'ok'}">${escapeHtml(row.severity || 'info')}</span></div>
      <div class="muted" style="margin-top:6px;">${escapeHtml(row.tenantLabel || 'tenant inconnu')}${row.tableCode ? ` • table ${escapeHtml(row.tableCode)}` : ''}</div>
      <div class="muted" style="margin-top:4px;">${escapeHtml(row.message || 'sans message')} • ${formatDate(row.createdAt)}</div>
    `;
    els.incidentList.appendChild(item);
  });

  els.auditCounts.textContent = `${audits.items?.length || 0}`;
  els.auditList.innerHTML = (audits.items || []).length ? '' : '<div class="empty">Aucun audit admin récent.</div>';
  (audits.items || []).forEach((row) => {
    const item = document.createElement('div');
    item.className = 'overview-item';
    item.innerHTML = `
      <div class="space-between"><strong>${escapeHtml(row.action || 'action')}</strong><span class="pill ${row.dangerLevel === 'high' ? 'danger' : row.dangerLevel === 'medium' ? 'warn' : 'ok'}">${escapeHtml(row.dangerLevel || 'info')}</span></div>
      <div class="muted" style="margin-top:6px;">${escapeHtml(row.tenantLabel || 'plateforme')} • ${escapeHtml(row.resourceType || 'ressource')}</div>
      <div class="muted" style="margin-top:4px;">${escapeHtml(row.adminLabel || 'admin inconnu')} • ${formatDate(row.createdAt)}</div>
    `;
    els.auditList.appendChild(item);
  });

  const shortcutItems = [...(shortcuts.recentTenants || []).map((row) => ({ type: 'tenant', row })), ...(shortcuts.suggestedActions || []).map((label) => ({ type: 'action', label }))];
  els.shortcutCounts.textContent = String(shortcutItems.length);
  els.shortcutList.innerHTML = shortcutItems.length ? '' : '<div class="empty">Aucun raccourci utile.</div>';
  shortcutItems.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'overview-item';
    if (entry.type === 'tenant') {
      item.innerHTML = `
        <div class="space-between"><strong>${escapeHtml(entry.row.name || entry.row.slug || entry.row.id)}</strong><span class="pill ${entry.row.status === 'active' ? 'ok' : 'warn'}">${escapeHtml(entry.row.status || 'draft')}</span></div>
        <div class="muted" style="margin-top:6px;">Dernière activité admin : ${formatDate(entry.row.updatedAt)}</div>
      `;
      item.style.cursor = 'pointer';
      item.addEventListener('click', async () => {
        state.selectedTenantId = entry.row.id;
        renderTenantList();
        renderDiagnosticsTenantOptions();
        await loadTenantWorkspace(entry.row.id);
        window.scrollTo({ top: document.querySelector('.main-grid').offsetTop - 12, behavior: 'smooth' });
      });
    } else {
      item.innerHTML = `<strong>${escapeHtml(entry.label)}</strong>`;
    }
    els.shortcutList.appendChild(item);
  });
}

function buildDiagnosticsQuery() {
  const params = new URLSearchParams();
  if (els.diagTenantFilter.value) params.set('tenantId', els.diagTenantFilter.value);
  if (els.diagSeverityFilter.value) params.set('severity', els.diagSeverityFilter.value);
  if (els.diagSourceFilter.value) params.set('source', els.diagSourceFilter.value);
  if (els.diagEventCodeFilter.value.trim()) params.set('eventCode', els.diagEventCodeFilter.value.trim());
  if (els.diagTableCodeFilter.value.trim()) params.set('tableCode', els.diagTableCodeFilter.value.trim().toUpperCase());
  if (els.diagSessionFilter.value.trim()) params.set('sessionId', els.diagSessionFilter.value.trim());
  if (els.diagTicketFilter.value.trim()) params.set('ticketId', els.diagTicketFilter.value.trim());
  if (els.diagFromFilter.value) params.set('from', new Date(els.diagFromFilter.value).toISOString());
  if (els.diagToFilter.value) params.set('to', new Date(els.diagToFilter.value).toISOString());
  params.set('order', els.diagOrderFilter.value || 'desc');
  if (els.diagUnresolvedOnly.checked) params.set('unresolvedOnly', 'true');
  return params.toString();
}

function renderDiagnosticsTenantOptions() {
  const current = els.diagTenantFilter.value;
  const options = ['<option value="">Tous</option>']
    .concat((state.tenants || []).map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name || tenant.slug || tenant.id)}</option>`));
  els.diagTenantFilter.innerHTML = options.join('');
  if ((state.tenants || []).some((tenant) => tenant.id === current)) {
    els.diagTenantFilter.value = current;
  }
}

async function loadDiagnostics() {
  setStatus(els.diagStatus, 'Chargement diagnostics…');
  const query = buildDiagnosticsQuery();
  const payload = await apiFetch(`/superadmin/diagnostics${query ? `?${query}` : ''}`);
  state.diagnostics = payload.diagnostics || { items: [], counts: { total: 0, info: 0, warn: 0, error: 0 } };
  const items = state.diagnostics.items || [];
  if (!items.some((item) => item.id === state.selectedDiagnosticId)) {
    state.selectedDiagnosticId = items[0]?.id || null;
  }
  renderDiagnostics();
  setStatus(els.diagStatus, 'Diagnostics chargés.', 'ok');
}

function renderDiagnostics() {
  const diagnostics = state.diagnostics || {};
  const counts = diagnostics.counts || {};
  const items = diagnostics.items || [];
  els.diagCounts.textContent = `${counts.total || 0} • info ${counts.info || 0} • warn ${counts.warn || 0} • error ${counts.error || 0}`;
  if (!items.length) {
    els.diagList.innerHTML = '<div class="empty">Aucun incident pour ces filtres.</div>';
    els.diagDetailBadge.className = 'pill warn';
    els.diagDetailBadge.textContent = 'Aucun';
    els.diagDetailMeta.textContent = 'Sélectionne un incident pour voir le détail.';
    els.diagDetailMessage.textContent = '';
    els.diagDetailPayload.textContent = '{}';
    return;
  }
  els.diagList.innerHTML = items.map((item) => {
    const severityClass = item.severity === 'error' ? 'danger' : (item.severity === 'warn' ? 'warn' : 'ok');
    const activeClass = item.id === state.selectedDiagnosticId ? ' active' : '';
    return `
      <div class="diag-item${activeClass}" data-diag-id="${escapeHtml(item.id)}">
        <div class="space-between">
          <strong>${escapeHtml(item.eventCode || item.eventType || 'incident')}</strong>
          <span class="pill ${severityClass}">${escapeHtml(item.severity || 'info')}</span>
        </div>
        <div>${escapeHtml(item.message || 'Aucun message')}</div>
        <div class="diag-meta">${escapeHtml(item.tenantLabel || 'tenant inconnu')} • ${escapeHtml(item.tableCode || 'sans table')} • ${escapeHtml(formatDate(item.createdAt))}</div>
      </div>`;
  }).join('');
  els.diagList.querySelectorAll('[data-diag-id]').forEach((node) => node.addEventListener('click', () => {
    state.selectedDiagnosticId = node.getAttribute('data-diag-id');
    renderDiagnostics();
  }));
  const selected = items.find((item) => item.id === state.selectedDiagnosticId) || items[0];
  const badgeClass = selected.severity === 'error' ? 'danger' : (selected.severity === 'warn' ? 'warn' : 'ok');
  els.diagDetailBadge.className = `pill ${badgeClass}`;
  els.diagDetailBadge.textContent = selected.severity || 'info';
  els.diagDetailMeta.textContent = `${selected.tenantLabel || 'tenant inconnu'} • ${selected.source || 'source inconnue'} • ${formatDate(selected.createdAt)}`;
  els.diagDetailMessage.textContent = `${selected.eventCode || selected.eventType || 'incident'} — ${selected.message || 'Aucun message'}`;
  els.diagDetailPayload.textContent = JSON.stringify(selected.payload || {}, null, 2);
}

function getAuditDangerClass(level) {
  const normalized = String(level || 'info').toLowerCase();
  if (['critical', 'high', 'error'].includes(normalized)) return 'danger';
  if (['medium', 'warn'].includes(normalized)) return 'warn';
  return 'ok';
}

function buildAuditQuery() {
  const params = new URLSearchParams();
  if (els.auditTenantFilter.value) params.set('tenantId', els.auditTenantFilter.value);
  if (els.auditDangerFilter.value) params.set('dangerLevel', els.auditDangerFilter.value);
  if (els.auditActionFilter.value.trim()) params.set('action', els.auditActionFilter.value.trim());
  if (els.auditResourceTypeFilter.value.trim()) params.set('resourceType', els.auditResourceTypeFilter.value.trim());
  if (els.auditResourceIdFilter.value.trim()) params.set('resourceId', els.auditResourceIdFilter.value.trim());
  if (els.auditAdminFilter.value.trim()) params.set('adminLabel', els.auditAdminFilter.value.trim());
  if (els.auditFromFilter.value) params.set('from', new Date(els.auditFromFilter.value).toISOString());
  if (els.auditToFilter.value) params.set('to', new Date(els.auditToFilter.value).toISOString());
  if (els.auditChangedOnly.checked) params.set('changedOnly', 'true');
  if (els.auditPlatformOnly.checked) params.set('platformOnly', 'true');
  params.set('order', els.auditOrderFilter.value || 'desc');
  params.set('limit', els.auditLimitFilter.value || '100');
  return params.toString();
}

function renderAuditTenantOptions() {
  const current = els.auditTenantFilter.value;
  const options = ['<option value="">Tous</option>']
    .concat((state.tenants || []).map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name || tenant.slug || tenant.id)}</option>`));
  els.auditTenantFilter.innerHTML = options.join('');
  if ((state.tenants || []).some((tenant) => tenant.id === current)) {
    els.auditTenantFilter.value = current;
  }
}

async function loadAudits() {
  setStatus(els.auditViewStatus, 'Chargement audits…');
  const query = buildAuditQuery();
  const payload = await apiFetch(`/superadmin/audits${query ? `?${query}` : ''}`);
  state.audits = payload.audits || { items: [], counts: { total: 0 } };
  const items = state.audits.items || [];
  if (!items.some((item) => item.id === state.selectedAuditId)) {
    state.selectedAuditId = items[0]?.id || null;
  }
  renderAudits();
  setStatus(els.auditViewStatus, 'Audits chargés.', 'ok');
}

function renderAudits() {
  const audits = state.audits || {};
  const counts = audits.counts || {};
  const items = audits.items || [];
  els.auditViewCounts.textContent = `${counts.total || 0} • info ${counts.info || 0} • warn ${counts.warn || 0} • critique ${counts.error || 0}`;
  if (!items.length) {
    els.auditViewList.innerHTML = '<div class="empty">Aucun audit pour ces filtres.</div>';
    els.auditDetailBadge.className = 'pill warn';
    els.auditDetailBadge.textContent = 'Aucun';
    els.auditDetailMeta.textContent = 'Sélectionne un audit pour voir le détail.';
    els.auditDetailTitle.textContent = '';
    els.auditDetailSummary.textContent = '';
    els.auditDetailBefore.textContent = '{}';
    els.auditDetailAfter.textContent = '{}';
    els.auditDetailMetaJson.textContent = '{}';
    return;
  }
  els.auditViewList.innerHTML = items.map((item) => {
    const activeClass = item.id === state.selectedAuditId ? ' active' : '';
    const dangerClass = getAuditDangerClass(item.dangerLevel);
    const summary = item.changedCount > 0 ? `${item.changedCount} champ(s) touché(s)` : 'sans diff structuré';
    return `
      <div class="audit-item${activeClass}" data-audit-id="${escapeHtml(item.id)}">
        <div class="space-between">
          <strong>${escapeHtml(item.action || 'action')}</strong>
          <span class="pill ${dangerClass}">${escapeHtml(item.dangerLevel || 'info')}</span>
        </div>
        <div>${escapeHtml(item.tenantLabel || 'plateforme')} • ${escapeHtml(item.resourceType || 'ressource')}</div>
        <div class="audit-meta">${escapeHtml(item.adminLabel || 'admin inconnu')} • ${escapeHtml(summary)} • ${escapeHtml(formatDate(item.createdAt))}</div>
      </div>`;
  }).join('');
  els.auditViewList.querySelectorAll('[data-audit-id]').forEach((node) => node.addEventListener('click', () => {
    state.selectedAuditId = node.getAttribute('data-audit-id');
    renderAudits();
  }));
  const selected = items.find((item) => item.id === state.selectedAuditId) || items[0];
  const dangerClass = getAuditDangerClass(selected.dangerLevel);
  const changedKeys = Array.isArray(selected.changedKeys) ? selected.changedKeys : [];
  const detailParts = [];
  if (selected.resourceId) detailParts.push(`resource ${selected.resourceId}`);
  if (selected.requestId) detailParts.push(`request ${selected.requestId}`);
  detailParts.push(`${selected.changedCount || 0} champ(s) modifié(s)`);
  if (changedKeys.length) detailParts.push(changedKeys.join(', '));
  els.auditDetailBadge.className = `pill ${dangerClass}`;
  els.auditDetailBadge.textContent = selected.dangerLevel || 'info';
  els.auditDetailMeta.textContent = `${selected.tenantLabel || 'plateforme'} • ${selected.adminLabel || 'admin inconnu'} • ${formatDate(selected.createdAt)}`;
  els.auditDetailTitle.textContent = `${selected.action || 'action'} — ${selected.resourceType || 'ressource'}`;
  els.auditDetailSummary.textContent = detailParts.join(' • ');
  els.auditDetailBefore.textContent = JSON.stringify(selected.before || {}, null, 2);
  els.auditDetailAfter.textContent = JSON.stringify(selected.after || {}, null, 2);
  els.auditDetailMetaJson.textContent = JSON.stringify(selected.meta || {}, null, 2);
}

function resetProtectedState() {
  state.overview = null;
  state.diagnostics = null;
  state.audits = null;
  state.tenants = [];
  state.selectedTenantId = null;
  state.qrCenter = null;
  state.tenantSettings = null;
  state.tenantStaffAccess = null;
  state.catalog = null;
  state.selectedDiagnosticId = null;
  state.selectedAuditId = null;
  state.selectedTableIds = new Set();
  state.tenantTables = null;
  state.selectedManageTableId = null;
  renderOverview();
  renderDiagnosticsTenantOptions();
  renderDiagnostics();
  renderAuditTenantOptions();
  renderAudits();
  renderTenantList();
  renderTenantSettings();
  renderTenantStaffAccess();
  renderTenantTables();
  renderQrCenter();
  renderCatalog();
  renderProvisioningSummary();
  setStatus(els.overviewStatus, 'Connecte-toi pour charger la vue plateforme.');
  setStatus(els.diagStatus, 'Connecte-toi pour lire les diagnostics.');
  setStatus(els.auditViewStatus, 'Connecte-toi pour lire les audits admin.');
  setStatus(els.settingsStatus, 'Aucun tenant chargé.');
  setStatus(els.staffAccessStatus, 'Aucun accès staff chargé.');
  setStatus(els.tablesStatus, 'Aucune table chargée.');
  setStatus(els.tenantStatus, 'Aucun tenant chargé.');
  setStatus(els.catalogStatus, 'Aucun catalogue chargé.');
  setStatus(els.provisioningStatus, 'Sélectionne un tenant pour lire le provisioning.');
  els.tenantTitle.textContent = 'Aucun tenant sélectionné';
  els.tenantMeta.textContent = 'Connecte-toi pour charger les données tenant.';
  els.tenantCount.textContent = '0';
}

function toggleCreateTenantPanel(forceOpen = null) {
  const shouldOpen = forceOpen == null ? els.createTenantPanel.classList.contains('hidden') : Boolean(forceOpen);
  els.createTenantPanel.classList.toggle('hidden', !shouldOpen);
  if (shouldOpen) setStatus(els.createTenantStatus, '');
}

function renderProvisioningDefaults() {
  const defaults = state.provisioningDefaults?.provisioningDefaults || {};
  const templates = Array.isArray(defaults.availableMenuTemplates) ? defaults.availableMenuTemplates : [];
  const current = defaults.defaultMenuTemplateCode || templates[0]?.code || '';
  els.createTenantTemplate.innerHTML = templates.length
    ? templates.map((tpl) => `<option value="${escapeHtml(tpl.code)}" ${tpl.code === current ? 'selected' : ''}>${escapeHtml(tpl.name || tpl.code)}</option>`).join('')
    : '<option value="">Aucun template disponible</option>';
}

function resetCreateTenantForm(useDefaults = true) {
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
  renderProvisioningDefaults();
}

async function loadProvisioningDefaults() {
  const payload = await apiFetch('/superadmin/provisioning/defaults');
  state.provisioningDefaults = payload;
  renderProvisioningDefaults();
  if (!els.createTenantName.value) resetCreateTenantForm(true);
}

function buildCreateTenantPayload() {
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

async function createTenantFromUi() {
  const payload = buildCreateTenantPayload();
  setStatus(els.createTenantStatus, 'Création tenant…');
  const created = await apiFetch('/superadmin/tenants', { method: 'POST', body: JSON.stringify(payload) });
  await loadTenants();
  state.selectedTenantId = created?.tenant?.id || state.selectedTenantId;
  await loadTenantWorkspace(state.selectedTenantId);
  renderTenantList();
  toggleCreateTenantPanel(false);
  resetCreateTenantForm(true);
  setStatus(els.globalStatus, `Tenant créé : ${created?.tenant?.name || created?.tenant?.id}.`, 'ok');
  setStatus(els.createTenantStatus, 'Tenant créé.', 'ok');
}

async function loadTenantTables(tenantId) {
  setStatus(els.tablesStatus, 'Chargement tables…');
  const params = new URLSearchParams();
  if (state.includeArchivedTables) params.set('includeArchived', 'true');
  const payload = await apiFetch(`/superadmin/tenants/${tenantId}/tables${params.toString() ? `?${params.toString()}` : ''}`);
  state.tenantTables = payload;
  if (state.selectedManageTableId && !((payload.tables || []).some((row) => row.id === state.selectedManageTableId))) state.selectedManageTableId = null;
  renderTenantTables();
  setStatus(els.tablesStatus, 'Tables chargées.', 'ok');
}

function resetTableForm() {
  state.selectedManageTableId = null;
  els.tableFormTitle.textContent = 'Nouvelle table';
  els.tableCodeInput.value = '';
  els.tableLabelInput.value = '';
  els.tableDisplayNameInput.value = '';
  els.tableSeatsInput.value = '0';
  els.tableActiveInput.checked = true;
  els.tableFormInfo.textContent = 'Crée une table proprement ou sélectionne une table existante pour l’éditer.';
  renderTenantTables();
}

function fillTableForm(table) {
  state.selectedManageTableId = table?.id || null;
  els.tableFormTitle.textContent = table ? `Éditer ${table.displayName || table.label || table.code}` : 'Nouvelle table';
  els.tableCodeInput.value = table?.code || '';
  els.tableLabelInput.value = table?.label || '';
  els.tableDisplayNameInput.value = table?.displayName || '';
  els.tableSeatsInput.value = String(table?.seats || 0);
  els.tableActiveInput.checked = table?.isActive !== false;
  els.tableFormInfo.textContent = table ? 'La sauvegarde met à jour cette table uniquement.' : 'Crée une table proprement.';
  renderTenantTables();
}

function buildTablePayload() {
  const code = els.tableCodeInput.value.trim().toUpperCase();
  if (!code) throw new Error('table_code_required');
  return { code, label: els.tableLabelInput.value.trim() || code, displayName: els.tableDisplayNameInput.value.trim() || els.tableLabelInput.value.trim() || code, seats: Number(els.tableSeatsInput.value || 0), isActive: els.tableActiveInput.checked };
}

function renderTenantTables() {
  const tenantId = state.selectedTenantId;
  const tables = Array.isArray(state.tenantTables?.tables) ? state.tenantTables.tables : [];
  els.reloadTablesBtn.disabled = !tenantId;
  els.newTableBtn.disabled = !tenantId;
  els.saveTableBtn.disabled = !tenantId;
  els.tablesManageList.innerHTML = tables.length ? '' : '<div class="empty">Aucune table à gérer pour ce tenant.</div>';
  tables.forEach((table, index) => {
    const card = document.createElement('div');
    card.className = `table-manage-card ${table.id === state.selectedManageTableId ? 'active' : ''}`;
    const statusText = table.archivedAt ? 'archivée' : (table.isActive ? 'active' : 'inactive');
    const statusClass = table.archivedAt ? 'danger' : (table.isActive ? 'ok' : 'warn');
    card.innerHTML = `
      <div class="space-between">
        <strong>${escapeHtml(table.displayName || table.label || table.code)}</strong>
        <span class="pill ${statusClass}">${statusText}</span>
      </div>
      <div class="muted">${escapeHtml(table.code)} • ${table.seats || 0} place(s) • ordre ${table.sortOrder || 0}</div>
      <div class="row table-order-chip">Créée ${escapeHtml(formatDate(table.createdAt))} • mise à jour ${escapeHtml(formatDate(table.updatedAt))}</div>
      <div class="actions">
        <button type="button" class="secondary" data-action="edit">Éditer</button>
        <button type="button" class="ghost" data-action="toggle">${table.isActive ? 'Désactiver' : 'Activer'}</button>
        <button type="button" class="ghost" data-action="up" ${index === 0 || table.archivedAt ? 'disabled' : ''}>Monter</button>
        <button type="button" class="ghost" data-action="down" ${index === tables.length - 1 || table.archivedAt ? 'disabled' : ''}>Descendre</button>
        <button type="button" class="danger" data-action="archive" ${table.archivedAt ? 'disabled' : ''}>Archiver</button>
      </div>`;
    card.querySelectorAll('[data-action]').forEach((btn) => btn.addEventListener('click', async () => {
      const action = btn.getAttribute('data-action');
      if (action === 'edit') return fillTableForm(table);
      if (action === 'toggle') return toggleManagedTable(table);
      if (action === 'up') return reorderManagedTable(table.id, -1);
      if (action === 'down') return reorderManagedTable(table.id, 1);
      if (action === 'archive') return archiveManagedTable(table);
    }));
    els.tablesManageList.appendChild(card);
  });
  renderProvisioningSummary();
}

async function saveManagedTable() {
  if (!state.selectedTenantId) throw new Error('tenant_requis');
  const payload = buildTablePayload();
  setStatus(els.tablesStatus, state.selectedManageTableId ? 'Mise à jour table…' : 'Création table…');
  if (state.selectedManageTableId) {
    await apiFetch(`/superadmin/tables/${state.selectedManageTableId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    await apiFetch(`/superadmin/tenants/${state.selectedTenantId}/tables`, { method: 'POST', body: JSON.stringify(payload) });
  }
  await Promise.all([loadTenantTables(state.selectedTenantId), loadQrCenter(state.selectedTenantId)]);
  setStatus(els.tablesStatus, 'Table enregistrée.', 'ok');
  resetTableForm();
}

async function toggleManagedTable(table) {
  const confirmed = await openDecisionModal(els, { title: table.isActive ? 'Désactiver une table' : 'Réactiver une table', subtitle: getTenantLabel(), level: 'warn', message: table.isActive ? 'Une table désactivée ne doit plus être considérée comme exploitable pour les QR et le service.' : 'La table redevient exploitable côté QR et exploitation.', impacts: [table.isActive ? 'Les QR associés ne doivent plus être utilisés tant que la table reste inactive.' : 'La table réapparaît dans le flux opérationnel du tenant.'], confirmLabel: table.isActive ? 'Oui, désactiver' : 'Oui, réactiver' });
  if (!confirmed) return;
  setStatus(els.tablesStatus, `${table.isActive ? 'Désactivation' : 'Réactivation'} table…`);
  await apiFetch(`/superadmin/tables/${table.id}/toggle-active`, { method: 'POST', body: JSON.stringify({ isActive: !table.isActive }) });
  await Promise.all([loadTenantTables(state.selectedTenantId), loadQrCenter(state.selectedTenantId)]);
  setStatus(els.tablesStatus, 'État table mis à jour.', 'ok');
}

async function archiveManagedTable(table) {
  const confirmed = await openDecisionModal(els, { title: 'Archiver une table', subtitle: getTenantLabel(), level: 'danger', message: 'Archiver une table la sort durablement de la structure exploitable du tenant.', impacts: ['La table disparaît des listes actives.', 'Le QR existant ne doit plus être considéré comme exploitable.', 'À faire seulement si la salle a réellement changé.'], confirmLabel: 'Oui, archiver la table' });
  if (!confirmed) return;
  setStatus(els.tablesStatus, 'Archivage table…');
  await apiFetch(`/superadmin/tables/${table.id}/archive`, { method: 'POST' });
  await Promise.all([loadTenantTables(state.selectedTenantId), loadQrCenter(state.selectedTenantId)]);
  resetTableForm();
  setStatus(els.tablesStatus, 'Table archivée.', 'ok');
}

async function reorderManagedTable(tableId, direction) {
  const tables = Array.isArray(state.tenantTables?.tables) ? [...state.tenantTables.tables] : [];
  const index = tables.findIndex((row) => row.id === tableId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= tables.length) return;
  const [row] = tables.splice(index, 1);
  tables.splice(target, 0, row);
  setStatus(els.tablesStatus, 'Réordonnancement tables…');
  await apiFetch(`/superadmin/tenants/${state.selectedTenantId}/tables/reorder`, { method: 'POST', body: JSON.stringify({ orderedTableIds: tables.map((row) => row.id) }) });
  await Promise.all([loadTenantTables(state.selectedTenantId), loadQrCenter(state.selectedTenantId)]);
  setStatus(els.tablesStatus, 'Ordre tables mis à jour.', 'ok');
}

function renderProvisioningSummary() {
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
  setStatus(els.provisioningStatus, tenant?.id ? (remaining.length ? `Tenant incomplet : ${remaining.join(', ')}.` : 'Tenant provisionné correctement sur les points clés.' ) : 'Sélectionne un tenant pour lire le provisioning.', tenant?.id ? (remaining.length ? 'error' : 'ok') : '');
  [els.provisioningGoSettingsBtn, els.provisioningGoTablesBtn, els.provisioningGoQrBtn, els.provisioningGoStaffBtn, els.provisioningGoCatalogBtn, els.refreshProvisioningBtn].forEach((btn) => btn.disabled = !tenant?.id);
}

async function loadTenants() {
  const payload = await apiFetch('/superadmin/tenants');
  state.tenants = Array.isArray(payload.tenants) ? payload.tenants : [];
  els.tenantCount.textContent = String(state.tenants.length);
  if (!state.selectedTenantId && state.tenants[0]?.id) state.selectedTenantId = state.tenants[0].id;
  renderTenantList();
  renderDiagnosticsTenantOptions();
  renderAuditTenantOptions();
  if (state.selectedTenantId) await loadTenantWorkspace(state.selectedTenantId);
  renderProvisioningSummary();
}

async function loadTenantWorkspace(tenantId) {
  state.selectedTableIds.clear();
  await Promise.all([loadTenantSettings(tenantId), loadTenantStaffAccess(tenantId), loadTenantTables(tenantId), loadQrCenter(tenantId), loadCatalog(tenantId)]);
}

function renderTenantList() {
  els.tenantList.innerHTML = '';
  if (!state.tenants.length) {
    els.tenantList.innerHTML = '<div class="empty">Aucun tenant trouvé.</div>';
    return;
  }
  state.tenants.forEach((tenant) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `tenant-card ${tenant.id === state.selectedTenantId ? 'active' : ''}`;
    item.innerHTML = `
      <div class="space-between">
        <strong>${escapeHtml(tenant.name || tenant.slug || tenant.id)}</strong>
        <span class="pill ${tenant.isActive ? 'ok' : 'warn'}">${tenant.status || (tenant.isActive ? 'active' : 'inactive')}</span>
      </div>
      <div class="muted">${escapeHtml(tenant.subdomain || tenant.slug || 'sans sous-domaine')}</div>
      <div class="muted">${tenant.tableCount || 0} table(s) • ${escapeHtml(tenant.timezone || 'Europe/Brussels')}</div>
    `;
    item.addEventListener('click', async () => {
      state.selectedTenantId = tenant.id;
      renderTenantList();
      await loadTenantWorkspace(tenant.id);
    });
    els.tenantList.appendChild(item);
  });
}

function diffSettingsPayload(nextPayload) {
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
  push('brandingPrimaryColor', 'Couleur principale', current.brandingPrimaryColor || '#4f46e5', nextPayload.brandingPrimaryColor || '#4f46e5');
  push('qrOrderingEnabled', 'QR ordering', currentFlags.qrOrderingEnabled !== false, nextFlags.qrOrderingEnabled !== false);
  push('clientMenuEnabled', 'Menu client visible', currentFlags.clientMenuEnabled !== false, nextFlags.clientMenuEnabled !== false);
  push('takeawayEnabled', 'Takeaway', currentFlags.takeawayEnabled !== false, nextFlags.takeawayEnabled !== false);
  push('demoMode', 'Mode démo', currentFlags.demoMode === true, nextFlags.demoMode === true);
  return changes;
}

async function confirmSettingsChange(nextPayload) {
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

function buildSettingsPayload() {
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

async function loadTenantSettings(tenantId) {
  setStatus(els.settingsStatus, 'Chargement settings…');
  const payload = await apiFetch(`/superadmin/tenants/${tenantId}/settings`);
  state.tenantSettings = payload;
  renderTenantSettings();
  setStatus(els.settingsStatus, 'Settings chargés.', 'ok');
}

function renderTenantSettings() {
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
  updateColorPreview(els, settings.brandingPrimaryColor || '#4f46e5');
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
      <div class="history-meta">${escapeHtml(row.adminLabel || 'admin inconnu')} • ${escapeHtml(row.dangerLevel || 'info')} • ${formatDate(row.createdAt)}</div>
    `;
    els.historyList.appendChild(item);
  });
}

async function saveTenantSettings() {
  if (!state.selectedTenantId) return;
  const nextPayload = buildSettingsPayload();
  const confirmed = await confirmSettingsChange(nextPayload);
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
  await Promise.all([loadTenants(), loadTenantSettings(state.selectedTenantId)]);
}

async function confirmStaffAccessChange(nextEnabled) {
  const currentEnabled = state.tenantStaffAccess?.staffAccess?.isEnabled !== false;
  if (currentEnabled === nextEnabled) return true;
  const tenantLabel = getTenantLabel();
  if (!nextEnabled) {
    return openDecisionModal(els, {
      title: "Désactiver l'accès staff",
      subtitle: tenantLabel,
      level: 'warn',
      message: "Tu coupes l'accès staff de ce tenant.",
      impacts: ['Le staff ne pourra plus utiliser son accès tenant dédié tant que tu ne le réactives pas.', "Si tu fais ça en service, tu crées toi-même l'incident."],
      confirmLabel: 'Oui, désactiver',
    });
  }
  return true;
}

async function loadTenantStaffAccess(tenantId) {
  setStatus(els.staffAccessStatus, 'Chargement accès staff…');
  const payload = await apiFetch(`/superadmin/tenants/${tenantId}/staff-access`);
  state.tenantStaffAccess = payload;
  renderTenantStaffAccess();
  setStatus(els.staffAccessStatus, 'Accès staff chargé.', 'ok');
  renderProvisioningSummary();
}

function renderTenantStaffAccess() {
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

async function saveTenantStaffAccess() {
  if (!state.selectedTenantId) return;
  const confirmed = await confirmStaffAccessChange(els.staffAccessEnabled.checked);
  if (!confirmed) {
    setStatus(els.staffAccessStatus, 'Changement annulé.', 'error');
    return;
  }
  setStatus(els.staffAccessStatus, 'Enregistrement accès staff…');
  const payload = await apiFetch(`/superadmin/tenants/${state.selectedTenantId}/staff-access`, { method: 'PATCH', body: JSON.stringify({ isEnabled: els.staffAccessEnabled.checked }) });
  state.tenantStaffAccess = { ok: true, tenant: payload.tenant || state.tenantStaffAccess?.tenant || null, staffAccess: payload.staffAccess || null, history: state.tenantStaffAccess?.history || [] };
  renderTenantStaffAccess();
  setStatus(els.staffAccessStatus, 'Accès staff enregistré.', 'ok');
  await Promise.all([loadTenants(), loadTenantStaffAccess(state.selectedTenantId)]);
}

async function rotateTenantStaffToken() {
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
  const payload = await apiFetch(`/superadmin/tenants/${state.selectedTenantId}/staff-access/rotate`, { method: 'POST', body: JSON.stringify({ nextToken: customToken || undefined }) });
  state.lastIssuedStaffToken = payload.issuedToken || '';
  els.issuedStaffToken.textContent = payload.issuedToken || 'Token non renvoyé';
  els.customStaffToken.value = '';
  state.tenantStaffAccess = { ok: true, tenant: payload.tenant || state.tenantStaffAccess?.tenant || null, staffAccess: payload.staffAccess || null, history: state.tenantStaffAccess?.history || [] };
  renderTenantStaffAccess();
  setStatus(els.staffAccessStatus, 'Token staff roté. L’ancien est mort.', 'ok');
  await Promise.all([loadTenants(), loadTenantStaffAccess(state.selectedTenantId)]);
}

async function loadQrCenter(tenantId) {
  setStatus(els.tenantStatus, 'Chargement du centre QR…');
  const payload = await apiFetch(`/superadmin/tenants/${tenantId}/qr-center`);
  state.qrCenter = payload;
  updateTenantHeader(payload);
  renderQrCenter();
  setStatus(els.tenantStatus, 'Centre QR chargé.', 'ok');
  renderProvisioningSummary();
}

function updateTenantHeader(payload) {
  const tenant = payload?.tenant || null;
  const tables = payload?.qrCenter?.tables || [];
  const readyCount = tables.filter((row) => row.qrStatus === 'ready').length;
  els.centerBadge.className = `pill ${tables.length ? 'ok' : 'warn'}`;
  els.centerBadge.textContent = tables.length ? 'Centre QR prêt' : 'Aucune table';
  const enabled = Boolean(tenant?.id && tables.length);
  els.printAllBtn.disabled = !enabled;
  els.selectAllBtn.disabled = !enabled;
  els.clearSelectionBtn.disabled = !enabled;
  els.reloadCenterBtn.disabled = !tenant?.id;
  syncSelectedButtons();
  if (!state.tenantSettings?.tenant) {
    els.tenantTitle.textContent = tenant?.name || tenant?.slug || 'Tenant';
    els.tenantMeta.textContent = `${tenant?.subdomain || tenant?.slug || tenant?.id || ''} • ${tables.length} table(s) • ${readyCount} QR prêt(s)`;
  }
}

function syncSelectedButtons() {
  els.printSelectedBtn.disabled = state.selectedTableIds.size === 0 || !state.selectedTenantId;
}

function renderQrCenter() {
  const tables = state.qrCenter?.qrCenter?.tables || [];
  els.tableList.innerHTML = '';
  if (!tables.length) {
    els.tableList.innerHTML = '<div class="empty">Aucune table disponible pour ce tenant.</div>';
    return;
  }
  tables.forEach((table) => {
    const checked = state.selectedTableIds.has(table.id) ? 'checked' : '';
    const statusClass = table.qrStatus === 'ready' ? 'ok' : (table.qrStatus === 'inactive' ? 'warn' : 'danger');
    const statusText = table.qrStatus === 'ready' ? 'QR prêt' : (table.qrStatus === 'inactive' ? 'Table inactive' : 'QR manquant');
    const card = document.createElement('div');
    card.className = `table-card ${table.isActive ? '' : 'inactive'}`;
    const imageUrl = table.qrImageUrl ? (() => {
      const url = new URL(getApiUrl(table.qrImageUrl));
      url.searchParams.set('token', state.adminToken);
      return url.toString();
    })() : '';
    card.innerHTML = `
      <div><input type="checkbox" data-table-select="${table.id}" ${checked} ${table.isActive ? '' : 'disabled'} /></div>
      <div>
        <div class="table-name">${escapeHtml(table.displayName || table.label || table.code)}</div>
        <div class="table-meta">${escapeHtml(table.code)} • ${table.seats || 0} place(s) • ordre ${table.sortOrder || 0}</div>
        <div class="row" style="margin-top:8px;"><span class="pill ${statusClass}">${statusText}</span><span class="muted">Dernière génération : ${formatDate(table.qrLastGeneratedAt)}</span></div>
      </div>
      <div>
        <div class="token-box"><strong>Token actif</strong><br>${escapeHtml(table.qrToken || 'aucun token')}</div>
        <div class="url-box" style="margin-top:8px;"><strong>URL active</strong><br>${escapeHtml(table.qrUrl || 'aucune URL')}</div>
      </div>
      <div>${imageUrl ? `<img class="preview" src="${imageUrl}" alt="QR ${escapeHtml(table.code)}" />` : '<div class="empty">Pas de QR</div>'}</div>
      <div class="actions">
        <button type="button" class="secondary" data-action="copy-url" data-id="${table.id}">Copier URL</button>
        <button type="button" class="success" data-action="reprint" data-id="${table.id}" ${table.isActive ? '' : 'disabled'}>Réimprimer</button>
        <button type="button" class="secondary" data-action="open-png" data-id="${table.id}" ${table.isActive ? '' : 'disabled'}>Voir QR</button>
        <button type="button" class="danger" data-action="regenerate" data-id="${table.id}" ${table.isActive ? '' : 'disabled'}>Régénérer</button>
      </div>
    `;
    els.tableList.appendChild(card);
  });
  els.tableList.querySelectorAll('[data-table-select]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const tableId = event.target.getAttribute('data-table-select');
      if (!tableId) return;
      if (event.target.checked) state.selectedTableIds.add(tableId);
      else state.selectedTableIds.delete(tableId);
      syncSelectedButtons();
    });
  });
  els.tableList.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const action = event.target.getAttribute('data-action');
      const id = event.target.getAttribute('data-id');
      const table = tables.find((row) => row.id === id);
      if (!table) return;
      if (action === 'copy-url') return copyText(table.qrUrl || '');
      if (action === 'reprint') return openWindow(`/superadmin/tables/${id}/qr-sheet.pdf`);
      if (action === 'open-png') return openWindow(`/superadmin/tables/${id}/qr.png`);
      if (action === 'regenerate') return regenerateTableQr(table);
    });
  });
}

async function regenerateTableQr(table) {
  const confirmed = await openDecisionModal(els, {
    title: 'Régénérer un QR',
    subtitle: `${getTenantLabel()} • ${table.displayName || table.label || table.code}`,
    level: 'danger',
    message: 'Tu es en train d’invalider un QR déjà potentiellement imprimé.',
    impacts: ['Tous les supports imprimés avec l’ancien QR cessent de fonctionner immédiatement.', 'Les clients ne pourront plus commander avec l’ancien QR.', 'Il faut réimprimer puis remplacer les supports physiques sans traîner.'],
    confirmLabel: 'Oui, régénérer le QR',
  });
  if (!confirmed) return;
  setStatus(els.tenantStatus, `Régénération de ${table.code}…`);
  await apiFetch(`/superadmin/tables/${table.id}/qr/regenerate`, { method: 'POST' });
  setStatus(els.tenantStatus, `QR régénéré pour ${table.code}. L’ancien QR est invalide.`, 'ok');
  await loadQrCenter(state.selectedTenantId);
}

async function loadCatalog(tenantId) {
  setStatus(els.catalogStatus, 'Chargement catalogue…');
  const payload = await apiFetch(`/superadmin/tenants/${tenantId}/catalog`);
  state.catalog = payload;
  renderCatalog();
  setStatus(els.catalogStatus, 'Catalogue chargé.', 'ok');
  renderProvisioningSummary();
}

function parseSupplementsForApi(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  return text.split('|').map((chunk) => {
    const [name, price] = String(chunk || '').split(':');
    return { name: String(name || '').trim(), price: Number(price || 0) };
  }).filter((entry) => entry.name);
}

function formatSupplements(value = []) {
  return Array.isArray(value) ? value.map((entry) => `${entry.name}:${Number(entry.price || 0)}`).join(' | ') : '';
}

function renderCatalog() {
  const catalog = state.catalog?.catalog || null;
  const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
  els.reloadCatalogBtn.disabled = !state.selectedTenantId;
  els.createCategoryBtn.disabled = !state.selectedTenantId;
  els.createItemBtn.disabled = !state.selectedTenantId;
  els.applyTemplateBtn.disabled = !state.selectedTenantId;
  els.catalogTemplateSelect.innerHTML = '';
  const templates = Array.isArray(catalog?.templates) ? catalog.templates : [];
  templates.forEach((template) => {
    const option = document.createElement('option');
    option.value = template.code;
    option.textContent = `${template.name} (${template.code})`;
    if (template.code === catalog.currentTemplateCode) option.selected = true;
    els.catalogTemplateSelect.appendChild(option);
  });
  els.catalogTemplateMeta.textContent = catalog ? `Template actuel : ${catalog.currentTemplateCode || 'aucun'} • appliqué ${formatDate(catalog.currentTemplateAppliedAt)}` : 'Aucun catalogue chargé.';
  els.catalogCount.textContent = `${categories.length} catégorie(s)`;
  els.catalogList.innerHTML = categories.length ? '' : '<div class="empty">Aucune catégorie catalogue pour ce tenant.</div>';
  categories.forEach((category) => {
    const item = document.createElement('div');
    item.className = 'history-card';
    const items = Array.isArray(category.items) ? category.items : [];
    item.innerHTML = `
      <div class="space-between"><strong>${escapeHtml(category.label)}</strong><div class="row"><span class="pill ${category.isActive ? 'ok' : 'warn'}">${category.isActive ? 'active' : 'inactive'}</span><button type="button" class="secondary" data-cat-edit="${category.id}">Éditer</button><button type="button" class="danger" data-cat-archive="${category.id}">Archiver</button></div></div>
      <div class="muted">code ${escapeHtml(category.categoryCode)} • ordre ${category.sortOrder} • ${items.length} produit(s)</div>
      <div style="margin-top:10px; display:grid; gap:8px;">${items.length ? items.map((entry) => `<div style="border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:10px;"><div class="space-between"><strong>${escapeHtml(entry.name)}</strong><div class="row"><span class="pill ${entry.isActive ? (entry.isSoldOut ? 'warn' : 'ok') : 'warn'}">${entry.isActive ? (entry.isSoldOut ? 'rupture' : 'visible') : 'masqué'}</span><button type="button" class="secondary" data-item-edit="${entry.id}">Éditer</button><button type="button" class="danger" data-item-archive="${entry.id}">Archiver</button></div></div><div class="muted">${escapeHtml(entry.itemCode)} • ${escapeHtml(entry.description || 'sans description')}</div><div class="muted">${entry.price.toFixed(2)} € • ordre ${entry.sortOrder} • allergènes ${escapeHtml((entry.allergens || []).join(', ') || 'aucun')}</div><div class="muted">suppléments ${escapeHtml(formatSupplements(entry.supplements) || 'aucun')}</div></div>`).join('') : '<div class="empty">Aucun produit dans cette catégorie.</div>'}</div>
    `;
    els.catalogList.appendChild(item);
  });
  els.catalogList.querySelectorAll('[data-cat-edit]').forEach((button) => button.addEventListener('click', () => editCategory(button.getAttribute('data-cat-edit'))));
  els.catalogList.querySelectorAll('[data-cat-archive]').forEach((button) => button.addEventListener('click', () => archiveCategory(button.getAttribute('data-cat-archive'))));
  els.catalogList.querySelectorAll('[data-item-edit]').forEach((button) => button.addEventListener('click', () => editItem(button.getAttribute('data-item-edit'))));
  els.catalogList.querySelectorAll('[data-item-archive]').forEach((button) => button.addEventListener('click', () => archiveItem(button.getAttribute('data-item-archive'))));
}

async function applyTemplate() {
  if (!state.selectedTenantId) return;
  const templateCode = els.catalogTemplateSelect.value;
  const confirmed = await openDecisionModal(els, {
    title: 'Appliquer un template catalogue',
    subtitle: getTenantLabel(),
    level: 'danger',
    message: 'Cette action recopie un template dans le tenant et peut écraser des lignes existantes portant les mêmes codes.',
    impacts: ['Les catégories et produits du tenant peuvent être remplacés code par code.', 'Si tu le fais sur un tenant actif sans contrôle, tu fabriques toi-même une incohérence de carte.', `Template ciblé : ${els.catalogTemplateSelect.options[els.catalogTemplateSelect.selectedIndex]?.textContent || 'inconnu'}`],
    confirmLabel: 'Oui, appliquer le template',
  });
  if (!confirmed) return;
  setStatus(els.catalogStatus, 'Application template…');
  await apiFetch(`/superadmin/tenants/${state.selectedTenantId}/catalog/apply-template`, { method: 'POST', body: JSON.stringify({ templateCode }) });
  await loadCatalog(state.selectedTenantId);
  setStatus(els.catalogStatus, 'Template appliqué.', 'ok');
}

async function createCategory() {
  if (!state.selectedTenantId) return;
  const label = window.prompt('Nom de la catégorie ?');
  if (!label) return;
  const categoryCode = window.prompt('Code catégorie (laisser vide pour générer automatiquement) ?', '');
  const sortOrder = window.prompt('Ordre affichage ?', '10');
  setStatus(els.catalogStatus, 'Création catégorie…');
  await apiFetch(`/superadmin/tenants/${state.selectedTenantId}/categories`, { method: 'POST', body: JSON.stringify({ label, categoryCode, sortOrder: Number(sortOrder || 0) }) });
  await loadCatalog(state.selectedTenantId);
  setStatus(els.catalogStatus, 'Catégorie créée.', 'ok');
}

async function editCategory(categoryId) {
  const category = (state.catalog?.catalog?.categories || []).find((entry) => entry.id === categoryId);
  if (!category) return;
  const label = window.prompt('Nom catégorie', category.label || '');
  if (!label) return;
  const sortOrder = window.prompt('Ordre affichage', String(category.sortOrder || 0));
  const keepActive = window.confirm('Catégorie visible ? OK = active / Annuler = inactive');
  setStatus(els.catalogStatus, 'Mise à jour catégorie…');
  await apiFetch(`/superadmin/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify({ label, sortOrder: Number(sortOrder || 0), isActive: keepActive }) });
  await loadCatalog(state.selectedTenantId);
  setStatus(els.catalogStatus, 'Catégorie mise à jour.', 'ok');
}

async function archiveCategory(categoryId) {
  const confirmed = await openDecisionModal(els, { title: 'Archiver une catégorie', subtitle: getTenantLabel(), level: 'warn', message: 'Archiver une catégorie la sort du catalogue visible et masque aussi ses produits.', impacts: ['Les produits rattachés ne seront plus visibles côté client.', 'C’est réversible seulement si tu remets ensuite une structure cohérente.'], confirmLabel: 'Oui, archiver' });
  if (!confirmed) return;
  setStatus(els.catalogStatus, 'Archivage catégorie…');
  await apiFetch(`/superadmin/categories/${categoryId}/archive`, { method: 'POST' });
  await loadCatalog(state.selectedTenantId);
  setStatus(els.catalogStatus, 'Catégorie archivée.', 'ok');
}

async function createItem() {
  if (!state.selectedTenantId) return;
  const categories = state.catalog?.catalog?.categories || [];
  if (!categories.length) throw new Error('aucune_categorie');
  const categoryLabel = window.prompt(`Choisis la catégorie parmi : ${categories.map((entry) => entry.label).join(', ')}`);
  if (!categoryLabel) return;
  const category = categories.find((entry) => entry.label.toLowerCase() === categoryLabel.toLowerCase() || entry.categoryCode.toLowerCase() === categoryLabel.toLowerCase());
  if (!category) throw new Error('categorie_introuvable');
  const name = window.prompt('Nom produit ?'); if (!name) return;
  const itemCode = window.prompt('Code produit (laisser vide pour générer automatiquement) ?', '');
  const description = window.prompt('Description ?', '');
  const price = window.prompt('Prix ?', '0');
  const imageUrl = window.prompt('Image URL ?', '');
  const sortOrder = window.prompt('Ordre affichage ?', '10');
  const allergens = window.prompt('Allergènes séparés par virgules ?', '');
  const supplements = window.prompt('Suppléments au format nom:prix | nom:prix', '');
  setStatus(els.catalogStatus, 'Création produit…');
  await apiFetch(`/superadmin/tenants/${state.selectedTenantId}/items`, { method: 'POST', body: JSON.stringify({ categoryId: category.id, name, itemCode, description, price: Number(price || 0), imageUrl, sortOrder: Number(sortOrder || 0), allergens: allergens.split(',').map((entry) => entry.trim()).filter(Boolean), supplements: parseSupplementsForApi(supplements) }) });
  await loadCatalog(state.selectedTenantId);
  setStatus(els.catalogStatus, 'Produit créé.', 'ok');
}

function findItemById(itemId) {
  const categories = state.catalog?.catalog?.categories || [];
  for (const category of categories) {
    const item = (category.items || []).find((entry) => entry.id === itemId);
    if (item) return item;
  }
  return null;
}

async function editItem(itemId) {
  const item = findItemById(itemId);
  if (!item) return;
  const categories = state.catalog?.catalog?.categories || [];
  const categoryTarget = window.prompt(`Catégorie (${categories.map((entry) => entry.label).join(', ')})`, item.categoryLabel || item.categoryCode || '');
  const category = categories.find((entry) => entry.label.toLowerCase() === String(categoryTarget || '').toLowerCase() || entry.categoryCode.toLowerCase() === String(categoryTarget || '').toLowerCase()) || categories.find((entry) => entry.id === item.categoryId);
  const name = window.prompt('Nom produit', item.name || ''); if (!name) return;
  const description = window.prompt('Description', item.description || '');
  const price = window.prompt('Prix', String(item.price || 0));
  const imageUrl = window.prompt('Image URL', item.imageUrl || '');
  const sortOrder = window.prompt('Ordre affichage', String(item.sortOrder || 0));
  const allergens = window.prompt('Allergènes séparés par virgules', (item.allergens || []).join(', '));
  const supplements = window.prompt('Suppléments au format nom:prix | nom:prix', formatSupplements(item.supplements));
  const isSoldOut = window.confirm('Produit en rupture temporaire ? OK = rupture / Annuler = disponible');
  const isActive = window.confirm('Produit visible ? OK = visible / Annuler = masqué');
  setStatus(els.catalogStatus, 'Mise à jour produit…');
  await apiFetch(`/superadmin/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ categoryId: category?.id || item.categoryId, name, description, price: Number(price || 0), imageUrl, sortOrder: Number(sortOrder || 0), allergens: allergens.split(',').map((entry) => entry.trim()).filter(Boolean), supplements: parseSupplementsForApi(supplements), isSoldOut, isActive }) });
  await loadCatalog(state.selectedTenantId);
  setStatus(els.catalogStatus, 'Produit mis à jour.', 'ok');
}

async function archiveItem(itemId) {
  const confirmed = await openDecisionModal(els, { title: 'Archiver un produit', subtitle: getTenantLabel(), level: 'warn', message: 'Archiver ce produit le retire du menu client.', impacts: ['Le produit ne sera plus commandable depuis le menu client.', 'À faire seulement si tu assumes la conséquence opérationnelle immédiatement.'], confirmLabel: 'Oui, archiver le produit' });
  if (!confirmed) return;
  setStatus(els.catalogStatus, 'Archivage produit…');
  await apiFetch(`/superadmin/items/${itemId}/archive`, { method: 'POST' });
  await loadCatalog(state.selectedTenantId);
  setStatus(els.catalogStatus, 'Produit archivé.', 'ok');
}

function openWindow(path) {
  const url = new URL(getApiUrl(path));
  url.searchParams.set('token', state.adminToken);
  window.open(url.toString(), '_blank', 'noopener');
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value || '');
    setStatus(els.tenantStatus, 'URL copiée.', 'ok');
  } catch (_) {
    setStatus(els.tenantStatus, 'Copie impossible.', 'error');
  }
}

els.apiBase.value = state.apiBase;
els.adminEmail.value = state.adminEmail;
updateColorPreview(els, '#4f46e5');
renderSessionInfo(els);

els.openCreateTenantBtn.addEventListener('click', () => toggleCreateTenantPanel(true));
els.closeCreateTenantBtn.addEventListener('click', () => toggleCreateTenantPanel(false));
els.createTenantName.addEventListener('input', () => {
  const slug = slugifyLocal(els.createTenantName.value);
  if (!els.createTenantSlug.value.trim()) els.createTenantSlug.value = slug;
  if (!els.createTenantSubdomain.value.trim()) els.createTenantSubdomain.value = slug;
});
els.createTenantBtn.addEventListener('click', async () => {
  try { await createTenantFromUi(); } catch (error) { setStatus(els.createTenantStatus, describeApiError(error) || 'Création tenant impossible', 'error'); }
});
els.refreshProvisioningBtn.addEventListener('click', async () => {
  try { if (!state.selectedTenantId) throw new Error('tenant_requis'); await loadTenantWorkspace(state.selectedTenantId); setStatus(els.provisioningStatus, 'Provisioning rechargé.', 'ok'); } catch (error) { setStatus(els.provisioningStatus, describeApiError(error) || 'Rechargement provisioning impossible', 'error'); }
});
els.provisioningGoSettingsBtn.addEventListener('click', () => document.getElementById('tenantTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
els.provisioningGoTablesBtn.addEventListener('click', () => document.getElementById('tablesSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
els.provisioningGoQrBtn.addEventListener('click', () => document.getElementById('qrSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
els.provisioningGoStaffBtn.addEventListener('click', () => els.reloadStaffAccessBtn.scrollIntoView({ behavior: 'smooth', block: 'start' }));
els.provisioningGoCatalogBtn.addEventListener('click', () => els.reloadCatalogBtn.scrollIntoView({ behavior: 'smooth', block: 'start' }));
els.reloadTablesBtn.addEventListener('click', async () => { try { if (!state.selectedTenantId) throw new Error('tenant_requis'); await loadTenantTables(state.selectedTenantId); } catch (error) { setStatus(els.tablesStatus, describeApiError(error) || 'Rechargement tables impossible', 'error'); } });
els.newTableBtn.addEventListener('click', () => resetTableForm());
els.tableFormResetBtn.addEventListener('click', () => resetTableForm());
els.saveTableBtn.addEventListener('click', async () => { try { await saveManagedTable(); } catch (error) { setStatus(els.tablesStatus, describeApiError(error) || 'Enregistrement table impossible', 'error'); } });
els.includeArchivedTables.addEventListener('change', async (event) => { state.includeArchivedTables = event.target.checked; try { if (!state.selectedTenantId) throw new Error('tenant_requis'); await loadTenantTables(state.selectedTenantId); } catch (error) { setStatus(els.tablesStatus, describeApiError(error) || 'Chargement tables impossible', 'error'); } });
els.brandingPrimaryColor.addEventListener('input', (event) => updateColorPreview(els, event.target.value));
els.authBtn.addEventListener('click', async () => {
  try {
    if (state.admin && state.adminToken) {
      logout(els, resetProtectedState);
      return;
    }
    await login(els, async () => {
      await Promise.all([loadOverview(), loadProvisioningDefaults(), loadTenants(), loadDiagnostics(), loadAudits()]);
    });
  } catch (error) {
    setStatus(els.globalStatus, describeApiError(error) || 'Connexion impossible', 'error');
  }
});
els.refreshBtn.addEventListener('click', async () => {
  try {
    if (!state.adminToken) throw new Error('superadmin_unauthorized');
    await Promise.all([loadOverview(), loadProvisioningDefaults(), loadTenants(), loadDiagnostics(), loadAudits()]);
    setStatus(els.globalStatus, 'Actualisation OK.', 'ok');
  } catch (error) {
    setStatus(els.globalStatus, describeApiError(error) || 'Actualisation impossible', 'error');
  }
});
els.diagApplyBtn.addEventListener('click', async () => {
  try { await loadDiagnostics(); } catch (error) { setStatus(els.diagStatus, describeApiError(error) || 'Chargement diagnostics impossible', 'error'); }
});
els.diagSelectedTenantBtn.addEventListener('click', async () => {
  try {
    if (!state.selectedTenantId) throw new Error('tenant_requis');
    els.diagTenantFilter.value = state.selectedTenantId;
    await loadDiagnostics();
  } catch (error) {
    setStatus(els.diagStatus, describeApiError(error) || 'Filtre tenant impossible', 'error');
  }
});
els.diagResetBtn.addEventListener('click', async () => {
  els.diagTenantFilter.value = '';
  els.diagSeverityFilter.value = '';
  els.diagSourceFilter.value = '';
  els.diagEventCodeFilter.value = '';
  els.diagTableCodeFilter.value = '';
  els.diagSessionFilter.value = '';
  els.diagTicketFilter.value = '';
  els.diagFromFilter.value = '';
  els.diagToFilter.value = '';
  els.diagOrderFilter.value = 'desc';
  els.diagUnresolvedOnly.checked = false;
  try { await loadDiagnostics(); } catch (error) { setStatus(els.diagStatus, describeApiError(error) || 'Réinitialisation diagnostics impossible', 'error'); }
});
els.auditApplyBtn.addEventListener('click', async () => {
  try { await loadAudits(); } catch (error) { setStatus(els.auditViewStatus, describeApiError(error) || 'Chargement audits impossible', 'error'); }
});
els.auditSelectedTenantBtn.addEventListener('click', async () => {
  try {
    if (!state.selectedTenantId) throw new Error('tenant_requis');
    els.auditTenantFilter.value = state.selectedTenantId;
    els.auditPlatformOnly.checked = false;
    await loadAudits();
  } catch (error) {
    setStatus(els.auditViewStatus, describeApiError(error) || 'Filtre audit impossible', 'error');
  }
});
els.auditResetBtn.addEventListener('click', async () => {
  els.auditTenantFilter.value = '';
  els.auditDangerFilter.value = '';
  els.auditActionFilter.value = '';
  els.auditResourceTypeFilter.value = '';
  els.auditResourceIdFilter.value = '';
  els.auditAdminFilter.value = '';
  els.auditFromFilter.value = '';
  els.auditToFilter.value = '';
  els.auditOrderFilter.value = 'desc';
  els.auditLimitFilter.value = '100';
  els.auditChangedOnly.checked = false;
  els.auditPlatformOnly.checked = false;
  try { await loadAudits(); } catch (error) { setStatus(els.auditViewStatus, describeApiError(error) || 'Réinitialisation audits impossible', 'error'); }
});
els.reloadSettingsBtn.addEventListener('click', async () => {
  try {
    if (!state.selectedTenantId) throw new Error('tenant_requis');
    await loadTenantSettings(state.selectedTenantId);
  } catch (error) {
    setStatus(els.settingsStatus, describeApiError(error) || 'Rechargement settings impossible', 'error');
  }
});
els.saveSettingsBtn.addEventListener('click', async () => {
  try { await saveTenantSettings(); } catch (error) { setStatus(els.settingsStatus, describeApiError(error) || 'Enregistrement impossible', 'error'); }
});
els.reloadStaffAccessBtn.addEventListener('click', async () => {
  try {
    if (!state.selectedTenantId) throw new Error('tenant_requis');
    await loadTenantStaffAccess(state.selectedTenantId);
  } catch (error) {
    setStatus(els.staffAccessStatus, describeApiError(error) || 'Rechargement accès staff impossible', 'error');
  }
});
els.saveStaffAccessBtn.addEventListener('click', async () => {
  try { await saveTenantStaffAccess(); } catch (error) { setStatus(els.staffAccessStatus, describeApiError(error) || 'Enregistrement accès staff impossible', 'error'); }
});
els.rotateStaffTokenBtn.addEventListener('click', async () => {
  try { await rotateTenantStaffToken(); } catch (error) { setStatus(els.staffAccessStatus, describeApiError(error) || 'Rotation token impossible', 'error'); }
});
els.reloadCenterBtn.addEventListener('click', async () => {
  try {
    if (!state.selectedTenantId) throw new Error('tenant_requis');
    await loadQrCenter(state.selectedTenantId);
  } catch (error) {
    setStatus(els.tenantStatus, describeApiError(error) || 'Rechargement impossible', 'error');
  }
});
els.selectAllBtn.addEventListener('click', () => {
  const tables = state.qrCenter?.qrCenter?.tables || [];
  state.selectedTableIds = new Set(tables.filter((row) => row.isActive).map((row) => row.id));
  renderQrCenter();
  syncSelectedButtons();
});
els.clearSelectionBtn.addEventListener('click', () => {
  state.selectedTableIds.clear();
  renderQrCenter();
  syncSelectedButtons();
});
els.printAllBtn.addEventListener('click', () => {
  if (!state.selectedTenantId) return;
  openWindow(`/superadmin/tenants/${state.selectedTenantId}/qr-sheet.pdf`);
});
els.printSelectedBtn.addEventListener('click', () => {
  if (!state.selectedTenantId || state.selectedTableIds.size === 0) return;
  const params = new URLSearchParams();
  params.set('tableIds', Array.from(state.selectedTableIds).join(','));
  openWindow(`/superadmin/tenants/${state.selectedTenantId}/qr-sheet.pdf?${params.toString()}`);
});
els.reloadCatalogBtn.addEventListener('click', async () => {
  try { if (!state.selectedTenantId) throw new Error('tenant_requis'); await loadCatalog(state.selectedTenantId); } catch (error) { setStatus(els.catalogStatus, describeApiError(error) || 'Rechargement catalogue impossible', 'error'); }
});
els.applyTemplateBtn.addEventListener('click', async () => { try { await applyTemplate(); } catch (error) { setStatus(els.catalogStatus, describeApiError(error) || 'Application template impossible', 'error'); } });
els.createCategoryBtn.addEventListener('click', async () => { try { await createCategory(); } catch (error) { setStatus(els.catalogStatus, describeApiError(error) || 'Création catégorie impossible', 'error'); } });
els.createItemBtn.addEventListener('click', async () => { try { await createItem(); } catch (error) { setStatus(els.catalogStatus, describeApiError(error) || 'Création produit impossible', 'error'); } });
els.decisionModalCancel.addEventListener('click', () => closeDecisionModal(els, false));
els.decisionModalClose.addEventListener('click', () => closeDecisionModal(els, false));
els.decisionModalConfirm.addEventListener('click', () => closeDecisionModal(els, true));
els.decisionModal.addEventListener('click', (event) => {
  if (event.target === els.decisionModal) closeDecisionModal(els, false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.pendingDecisionResolver) closeDecisionModal(els, false);
});
if (state.adminToken) {
  state.admin = { email: state.adminEmail || null, fullName: null };
  renderSessionInfo(els);
  Promise.all([loadOverview(), loadProvisioningDefaults(), loadTenants(), loadDiagnostics(), loadAudits()])
    .catch((error) => {
      logout(els, resetProtectedState);
      setStatus(els.globalStatus, describeApiError(error) || 'Connexion automatique impossible', 'error');
    });
} else {
  resetProtectedState();
}
