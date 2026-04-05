import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, formatDate, setStatus } from './utils.js';

export function buildDiagnosticsQuery(els) {
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

export function renderDiagnosticsTenantOptions(els) {
  const current = els.diagTenantFilter.value;
  const options = ['<option value="">Tous</option>']
    .concat((state.tenants || []).map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name || tenant.slug || tenant.id)}</option>`));
  els.diagTenantFilter.innerHTML = options.join('');
  if ((state.tenants || []).some((tenant) => tenant.id === current)) {
    els.diagTenantFilter.value = current;
  }
}

export async function loadDiagnostics(els) {
  setStatus(els.diagStatus, 'Chargement diagnostics…');
  const query = buildDiagnosticsQuery(els);
  const payload = await apiFetch(`/superadmin/diagnostics${query ? `?${query}` : ''}`);
  state.diagnostics = payload.diagnostics || { items: [], counts: { total: 0, info: 0, warn: 0, error: 0 } };
  const items = state.diagnostics.items || [];
  if (!items.some((item) => item.id === state.selectedDiagnosticId)) {
    state.selectedDiagnosticId = items[0]?.id || null;
  }
  renderDiagnostics(els);
  setStatus(els.diagStatus, 'Diagnostics chargés.', 'ok');
}

export function renderDiagnostics(els) {
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
    renderDiagnostics(els);
  }));
  const selected = items.find((item) => item.id === state.selectedDiagnosticId) || items[0];
  const badgeClass = selected.severity === 'error' ? 'danger' : (selected.severity === 'warn' ? 'warn' : 'ok');
  els.diagDetailBadge.className = `pill ${badgeClass}`;
  els.diagDetailBadge.textContent = selected.severity || 'info';
  els.diagDetailMeta.textContent = `${selected.tenantLabel || 'tenant inconnu'} • ${selected.source || 'source inconnue'} • ${formatDate(selected.createdAt)}`;
  els.diagDetailMessage.textContent = `${selected.eventCode || selected.eventType || 'incident'} — ${selected.message || 'Aucun message'}`;
  els.diagDetailPayload.textContent = JSON.stringify(selected.payload || {}, null, 2);
}
