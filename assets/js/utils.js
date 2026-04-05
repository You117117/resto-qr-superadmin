import { DEFAULT_COLOR, state } from './state.js';

export function setStatus(target, message = '', type = '') {
  if (!target) return;
  target.textContent = message;
  target.className = `status ${type}`.trim();
}

export function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatDate(value) {
  if (!value) return 'jamais';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-BE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function updateColorPreview(els, value) {
  const color = /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : DEFAULT_COLOR;
  els.brandingPrimaryColor.value = color;
  els.brandingColorText.textContent = color;
  els.brandingSwatch.style.background = color;
}

export function describeApiError(error) {
  const code = String(error?.message || error || 'erreur_inconnue');
  const map = {
    token_admin_requis: 'Connexion admin requise.',
    superadmin_unauthorized: 'Connexion admin requise.',
    tenant_requis: "Sélectionne d'abord un tenant.",
    tenant_name_required: 'Le nom du tenant est obligatoire.',
    tenant_subdomain_invalid: 'Le sous-domaine est invalide.',
    tenant_subdomain_already_exists: 'Ce sous-domaine est déjà utilisé.',
    tenant_slug_already_exists: 'Ce slug est déjà utilisé.',
    menu_template_not_found: 'Le template menu demandé est introuvable.',
    menu_template_inactive: 'Le template menu demandé est inactif.',
    table_code_required: 'Le code table est obligatoire.',
    table_code_invalid: 'Le code table est invalide.',
    table_code_already_exists: 'Ce code table existe déjà pour ce tenant.',
    ordered_table_ids_required: 'Impossible de réordonner sans liste complète des tables.',
    table_reorder_count_mismatch: 'Le réordonnancement reçu ne correspond pas au nombre de tables actives.',
    table_reorder_invalid_ids: 'Le réordonnancement contient des IDs invalides.',
    http_401: 'Accès refusé. Le token admin est invalide ou expiré.',
    http_403: 'Accès interdit pour cette action.',
    http_404: 'La ressource demandée est introuvable.',
    http_409: 'Conflit détecté. Recharge les données avant de recommencer.',
    http_422: 'Données invalides. Vérifie les champs saisis.',
    http_500: "Erreur serveur. Rien n'a été confirmé côté backend.",
  };
  return map[code] || code;
}

export function getTenantLabel() {
  const tenant = state.tenants.find((row) => row.id === state.selectedTenantId)
    || state.tenantSettings?.tenant
    || state.qrCenter?.tenant
    || null;
  return tenant?.name || tenant?.slug || tenant?.subdomain || tenant?.id || 'ce tenant';
}

export function slugifyLocal(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function setPlatformBadge(target, label, status) {
  const normalized = String(status || 'warn').toLowerCase();
  const cls = normalized === 'ok' || normalized === 'ready'
    ? 'ok'
    : (normalized === 'error' ? 'danger' : 'warn');
  target.className = `pill ${cls}`;
  target.textContent = label;
}
