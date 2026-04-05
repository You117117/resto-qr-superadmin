import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml } from './utils.js';

export async function loadTenants(els, renderTenantList, renderDiagnosticsTenantOptions, renderAuditTenantOptions, loadTenantWorkspace, renderProvisioningSummary) {
  const payload = await apiFetch('/superadmin/tenants');
  state.tenants = Array.isArray(payload.tenants) ? payload.tenants : [];
  els.tenantCount.textContent = String(state.tenants.length);
  if (!state.selectedTenantId && state.tenants[0]?.id) state.selectedTenantId = state.tenants[0].id;
  renderTenantList(els);
  renderDiagnosticsTenantOptions(els);
  renderAuditTenantOptions(els);
  if (state.selectedTenantId) await loadTenantWorkspace(state.selectedTenantId);
  renderProvisioningSummary(els);
}

export function renderTenantList(els, loadTenantWorkspace = async () => {}) {
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
      renderTenantList(els, loadTenantWorkspace);
      await loadTenantWorkspace(tenant.id);
    });
    els.tenantList.appendChild(item);
  });
}
