import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, formatDate, setPlatformBadge, setStatus } from './utils.js';

export async function loadOverview(els, loadTenantWorkspace, renderTenantList, renderDiagnosticsTenantOptions) {
  setStatus(els.overviewStatus, 'Chargement vue plateforme…');
  const payload = await apiFetch('/superadmin/overview');
  state.overview = payload.overview || null;
  renderOverview(els, loadTenantWorkspace, renderTenantList, renderDiagnosticsTenantOptions);
  setStatus(els.overviewStatus, 'Vue plateforme chargée.', 'ok');
}

export function renderOverview(els, loadTenantWorkspace = async () => {}, renderTenantList = () => {}, renderDiagnosticsTenantOptions = () => {}) {
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

  const shortcutItems = [
    ...(shortcuts.recentTenants || []).map((row) => ({ type: 'tenant', row })),
    ...(shortcuts.suggestedActions || []).map((label) => ({ type: 'action', label })),
  ];

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
