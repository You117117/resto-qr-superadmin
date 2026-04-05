import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, formatDate, setStatus } from './utils.js';

export function getAuditDangerClass(level) {
  const normalized = String(level || 'info').toLowerCase();
  if (['critical', 'high', 'error'].includes(normalized)) return 'danger';
  if (['medium', 'warn'].includes(normalized)) return 'warn';
  return 'ok';
}

export function buildAuditQuery(els) {
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

export function renderAuditTenantOptions(els) {
  const current = els.auditTenantFilter.value;
  const options = ['<option value="">Tous</option>']
    .concat((state.tenants || []).map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name || tenant.slug || tenant.id)}</option>`));
  els.auditTenantFilter.innerHTML = options.join('');
  if ((state.tenants || []).some((tenant) => tenant.id === current)) {
    els.auditTenantFilter.value = current;
  }
}

export async function loadAudits(els) {
  setStatus(els.auditViewStatus, 'Chargement audits…');
  const query = buildAuditQuery(els);
  const payload = await apiFetch(`/superadmin/audits${query ? `?${query}` : ''}`);
  state.audits = payload.audits || { items: [], counts: { total: 0 } };
  const items = state.audits.items || [];
  if (!items.some((item) => item.id === state.selectedAuditId)) {
    state.selectedAuditId = items[0]?.id || null;
  }
  renderAudits(els);
  setStatus(els.auditViewStatus, 'Audits chargés.', 'ok');
}

export function renderAudits(els) {
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
    renderAudits(els);
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
