/**
 * dialog.js — animated open/close for native <dialog> elements.
 *
 * showModal() and close() are instant, so the exit animation needs a class that
 * is removed only once the animation has finished.
 */

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Longest exit animation in animations.css, plus headroom. */
const EXIT_TIMEOUT_MS = 600;

export function openDialog(dialog) {
  if (dialog.open) return;
  dialog.classList.remove('is-closing');
  dialog.showModal();
  dialog.classList.add('is-open');
}

export function closeDialog(dialog) {
  if (!dialog.open || dialog.classList.contains('is-closing')) return;

  dialog.classList.remove('is-open');

  if (reducedMotion.matches) {
    dialog.close();
    return;
  }

  dialog.classList.add('is-closing');

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    dialog.classList.remove('is-closing');
    dialog.close();
  };

  dialog.addEventListener('animationend', finish, { once: true });
  // Safety net: if the animation never runs the dialog must still close.
  setTimeout(finish, EXIT_TIMEOUT_MS);
}

/**
 * Wire the shared dismissal affordances: the close button, a tap on the
 * backdrop, and the Escape key.
 */
export function wireDismiss(dialog, onClose) {
  const close = () => {
    closeDialog(dialog);
    if (onClose) onClose();
  };

  dialog.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', close);
  });

  dialog.addEventListener('click', (event) => {
    // A click that lands on the dialog element itself is a backdrop click;
    // anything inside the sheet has a descendant as its target.
    if (event.target === dialog) close();
  });

  dialog.addEventListener('cancel', (event) => {
    // Escape would close instantly and skip the animation.
    event.preventDefault();
    close();
  });
}
