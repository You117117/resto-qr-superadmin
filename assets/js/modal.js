import { state } from './state.js';
import { escapeHtml } from './utils.js';

export function closeDecisionModal(els, result = false) {
  if (!state.pendingDecisionResolver) return;
  const resolver = state.pendingDecisionResolver;
  state.pendingDecisionResolver = null;
  els.decisionModal.classList.remove('open');
  els.decisionModal.setAttribute('aria-hidden', 'true');
  resolver(Boolean(result));
}

export function openDecisionModal(els, {
  title,
  subtitle = '',
  level = 'warn',
  message = '',
  impacts = [],
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
}) {
  if (state.pendingDecisionResolver) closeDecisionModal(els, false);
  els.decisionModalTitle.textContent = title || 'Confirmation';
  els.decisionModalSubtitle.textContent = subtitle || 'Action sensible';
  els.decisionModalMessage.textContent = message || '';
  els.decisionModalNote.className = `modal-note ${level}`;
  els.decisionModalNote.textContent = level === 'danger'
    ? 'Action critique : lis l’impact avant de confirmer.'
    : level === 'warn'
      ? 'Action sensible : vérifie ce que tu es en train de changer.'
      : 'Action encadrée.';
  els.decisionModalCancel.textContent = cancelLabel;
  els.decisionModalConfirm.textContent = confirmLabel;
  els.decisionModalConfirm.className = level === 'danger'
    ? 'danger'
    : (level === 'warn' ? 'warning' : 'success');

  if (Array.isArray(impacts) && impacts.length) {
    els.decisionModalImpact.style.display = 'grid';
    els.decisionModalImpactList.innerHTML = impacts.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  } else {
    els.decisionModalImpact.style.display = 'none';
    els.decisionModalImpactList.innerHTML = '';
  }

  els.decisionModal.classList.add('open');
  els.decisionModal.setAttribute('aria-hidden', 'false');
  return new Promise((resolve) => {
    state.pendingDecisionResolver = resolve;
  });
}
