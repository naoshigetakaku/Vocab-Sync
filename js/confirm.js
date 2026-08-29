/**
 * confirm.js — centred confirmation popup.
 *
 * Replaces the older two-tap "arm the button" pattern: a destructive action
 * deserves a deliberate choice, not a button that quietly changes meaning.
 * Tapping outside cancels.
 */

import { openDialog, closeDialog } from './dialog.js';

const dialog = document.getElementById('confirm-dialog');
const titleElement = document.getElementById('confirm-title');
const textElement = document.getElementById('confirm-text');
const cancelButton = document.getElementById('confirm-cancel');
const acceptButton = document.getElementById('confirm-accept');

let pending = null;

function resolve(value) {
  const settle = pending;
  pending = null;
  closeDialog(dialog);
  if (settle) settle(value);
}

export function initConfirm() {
  cancelButton.addEventListener('click', () => resolve(false));
  acceptButton.addEventListener('click', () => resolve(true));

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) resolve(false);
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    resolve(false);
  });
}

/**
 * @param {{title: string, text?: string, accept?: string}} config
 * @returns {Promise<boolean>}
 */
export function askConfirm(config) {
  return new Promise((settle) => {
    titleElement.textContent = config.title;
    textElement.textContent = config.text || '';
    textElement.hidden = !config.text;
    acceptButton.textContent = config.accept || 'Confirm';

    pending = settle;
    openDialog(dialog);
  });
}
