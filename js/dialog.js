/**
 * dialog.js — animated open/close for native <dialog> elements.
 *
 * showModal() and close() are instant, so the exit animation needs a class that
 * is removed only once the animation has finished. Opening also freezes the
 * list behind the dialog and, for bottom sheets, arms swipe-to-dismiss.
 */

import { lock, unlock } from './scroll-lock.js';
import { enableSwipeToDismiss } from './swipe.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Longest exit animation in animations.css, plus headroom. */
const EXIT_TIMEOUT_MS = 600;

/** Entrance animations, by name, from animations.css. */
const ENTER_ANIMATIONS = ['sheet-in', 'card-in', 'alert-in'];

/** Longest entrance animation, plus headroom. */
const ENTER_TIMEOUT_MS = 420;

/**
 * Which dialogs currently hold a scroll lock.
 *
 * The obvious approach — unlocking on the dialog's own `close` event — is not
 * dependable: some engines do not fire it for a scripted close(). Locks are
 * therefore released explicitly, and this set makes a double release
 * impossible whichever path got there first.
 */
const holdsLock = new WeakSet();

function acquireLock(dialog) {
  if (holdsLock.has(dialog)) return;
  holdsLock.add(dialog);
  lock();
}

function releaseLock(dialog) {
  if (!holdsLock.has(dialog)) return;
  holdsLock.delete(dialog);
  unlock();
}

export function openDialog(dialog) {
  if (dialog.open) return;

  dialog.classList.remove('is-closing', 'is-grabbed', 'is-settling');
  dialog.style.removeProperty('--drag-y');

  dialog.showModal();
  dialog.classList.add('is-open');

  // Once the entrance has played, drop the class. Its fill-mode would keep
  // pinning transform, which a swipe needs to control.
  //
  // The timer is not belt-and-braces: a backgrounded tab may never fire
  // animationend at all, and the class has to come off regardless.
  let entered = false;
  const settle = () => {
    if (entered) return;
    entered = true;
    dialog.classList.remove('is-open');
    dialog.removeEventListener('animationend', onEntered);
  };
  const onEntered = (event) => {
    if (ENTER_ANIMATIONS.indexOf(event.animationName) === -1) return;
    settle();
  };

  dialog.addEventListener('animationend', onEntered);
  setTimeout(settle, ENTER_TIMEOUT_MS);

  acquireLock(dialog);
}

/** Close immediately, skipping the exit animation. */
export function finishClose(dialog) {
  dialog.classList.remove('is-open', 'is-closing');
  if (dialog.open) dialog.close();
  releaseLock(dialog);
}

export function closeDialog(dialog) {
  if (!dialog.open || dialog.classList.contains('is-closing')) return;

  dialog.classList.remove('is-open');

  if (reducedMotion.matches) {
    dialog.close();
    releaseLock(dialog);
    return;
  }

  dialog.classList.add('is-closing');

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    dialog.classList.remove('is-closing');
    if (dialog.open) dialog.close();
    releaseLock(dialog);
  };

  dialog.addEventListener('animationend', finish, { once: true });
  // Safety net: if the animation never runs the dialog must still close.
  setTimeout(finish, EXIT_TIMEOUT_MS);
}

/**
 * Wire the shared dismissal affordances: the close button, a tap on the
 * backdrop, the Escape key, and — on sheets — a downward swipe.
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

  if (dialog.classList.contains('sheet')) {
    enableSwipeToDismiss(dialog, () => {
      finishClose(dialog);
      if (onClose) onClose();
    });
  }
}
