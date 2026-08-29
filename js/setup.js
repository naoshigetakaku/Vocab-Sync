/**
 * setup.js — first-run connection sheet.
 *
 * Asks for the Web App URL and the passphrase, verifies them with a real
 * request, and only then stores them.
 */

import { saveCredentials, clearCredentials } from './auth.js';
import { api } from './api.js';
import { openDialog, closeDialog } from './dialog.js';

const dialog = document.getElementById('setup-dialog');
const form = document.getElementById('setup-form');
const urlField = document.getElementById('field-url');
const passphraseField = document.getElementById('field-passphrase');
const errorElement = document.getElementById('setup-error');
const submitButton = document.getElementById('setup-submit');

let onConnected = () => {};
let busy = false;

function showError(message) {
  errorElement.textContent = message;
  errorElement.hidden = false;
  form.classList.remove('is-invalid');
  void form.offsetWidth;
  form.classList.add('is-invalid');
}

function setBusy(value) {
  busy = value;
  submitButton.disabled = value;
  submitButton.textContent = value ? 'Checking…' : 'Connect';
}

export function openSetup() {
  errorElement.hidden = true;
  setBusy(false);
  openDialog(dialog);
}

export function initSetup(handlers) {
  onConnected = handlers.onConnected;

  // No dismissal wiring here: without credentials the app cannot do anything,
  // so this sheet stays put until the connection succeeds.
  dialog.addEventListener('cancel', (event) => event.preventDefault());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const url = urlField.value.trim();
    const passphrase = passphraseField.value.trim();

    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) {
      showError('That does not look like a Web App /exec URL.');
      return;
    }
    if (!passphrase) {
      showError('Enter the passphrase from Code.gs.');
      return;
    }

    setBusy(true);
    saveCredentials(url, passphrase);

    try {
      await api.list();
      closeDialog(dialog);
      form.reset();
      onConnected();
    } catch (error) {
      clearCredentials();
      showError(error.message);
    } finally {
      setBusy(false);
    }
  });
}
