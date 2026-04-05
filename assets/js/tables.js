import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, setStatus } from './utils.js';

export async function loadTenantTables(els, tenantId, renderProvisioningSummary) {
  setStatus(els.tablesStatus, 'Chargement tables…');
  const payload = await apiFetch(`/superadmin/tenants/${tenantId}/tables`);
  state.tenantTables = payload;
  renderTenantTables(els);
  setStatus(els.tablesStatus, 'Tables chargées.', 'ok');
  renderProvisioningSummary(els);
}

export function renderTenantTables(els) {
  const tables = Array.isArray(state.tenantTables?.tables) ? state.tenantTables.tables : [];
  const visible = tables.filter((row) => (els.includeArchivedTables.checked ? true : !row.archivedAt));
  els.tablesManageList.innerHTML = visible.length
    ? visible.map((row) => `
      <div class="table-row">
        <strong>${escapeHtml(row.code)}</strong>
        <span>${escapeHtml(row.label || '')}</span>
        <span class="pill ${row.isActive ? 'ok' : 'warn'}">${row.isActive ? 'active' : 'inactive'}</span>
      </div>`).join('')
    : '<div class="empty">Aucune table.</div>';
}
