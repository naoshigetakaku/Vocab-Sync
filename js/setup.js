/**
 * setup.js — the connection sheet.
 *
 * Serves two jobs. On first run it asks for the Web App URL and the passphrase
 * and cannot be dismissed, because nothing else in the app can do anything
 * without them. Opened from the header afterwards it is a settings sheet:
 * pre-filled, dismissible, and able to disconnect — which is what you need
 * when the deployment has moved or the app is talking to a stale one.
 */

import { getCredentials, saveCredentials, clearCredentials } from './auth.js';
import { api } from './api.js';
import { reset } from './store.js';
import { openDialog, closeDialog, finishClose } from './dialog.js';
import { enableSwipeToDismiss } from './swipe.js';

const dialog = document.getElementById('setup-dialog');
const form = document.getElementById('setup-form');
const grip = document.getElementById('setup-grip');
const dismissRow = document.getElementById('setup-dismiss');
const titleElement = document.getElementById('setup-title');
const leadElement = dialog.querySelector('.sheet__lead');
const urlField = document.getElementById('field-url');
const passphraseField = document.getElementById('field-passphrase');
const errorElement = document.getElementById('setup-error');
const submitButton = document.getElementById('setup-submit');
const disconnectButton = document.getElementById('setup-disconnect');

const FIRST_RUN_LEAD =
  'Paste the Web App URL from your Apps Script deployment and the passphrase '
  + 'you set in Code.gs. Both are stored on this device only, so every device '
  + 'needs this once.';

const SETTINGS_LEAD =
  'Point this device at a different deployment, or re-enter the passphrase '
  + 'after changing it in Code.gs. Disconnecting clears both from this device; '
  + 'your words stay in the spreadsheet.';

let onConnected = () => {};
let dismissible = false;
let swipeWired = false;
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
  disconnectButton.disabled = value;
  submitButton.textContent = value ? 'Checking…' : 'Connect';
}

function setMode(manual) {
  dismissible = manual;
  titleElement.textContent = manual ? 'Connection' : 'Connect';
  leadElement.textContent = manual ? SETTINGS_LEAD : FIRST_RUN_LEAD;
  grip.hidden = !manual;
  dismissRow.hidden = !manual;
  disconnectButton.hidden = !manual;
}

function close() {
  if (!dismissible || busy) return;
  closeDialog(dialog);
}

/**
 * @param {{manual?: boolean}} [options] manual opens it as a settings sheet
 */
export function openSetup(options) {
  const manual = Boolean(options && options.manual);
  const credentials = getCredentials();

  setMode(manual);
  errorElement.hidden = true;
  setBusy(false);

  if (manual && credentials) {
    urlField.value = credentials.url;
    passphraseField.value = credentials.passphrase;
  } else {
    form.reset();
  }

  // Only armed once the sheet is something you are allowed to leave.
  if (manual && !swipeWired) {
    swipeWired = true;
    enableSwipeToDismiss(dialog, () => {
      if (dismissible && !busy) finishClose(dialog);
      else openDialog(dialog);
    });
  }

  openDialog(dialog);
}

export function initSetup(handlers) {
  onConnected = handlers.onConnected;

  dialog.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', close);
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  disconnectButton.addEventListener('click', () => {
    if (busy) return;
    clearCredentials();
    reset();
    form.reset();
    errorElement.hidden = true;
    // Straight back to the first-run sheet rather than an empty app with no
    // way to get the connection back.
    setMode(false);
    urlField.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const url = urlField.value.trim();
    const passphrase = passphraseField.value.trim();

    // Personal accounts get /macros/s/<id>/exec; Workspace accounts get
    // /a/macros/<domain>/s/<id>/exec. Both are valid deployments.
    if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[^/]+\/exec$/.test(url)) {
      showError('That does not look like a Web App /exec URL.');
      return;
    }
    if (!passphrase) {
      showError('Enter the passphrase from Code.gs.');
      return;
    }

    const previous = getCredentials();
    const changed = !previous || previous.url !== url || previous.passphrase !== passphrase;

    setBusy(true);
    saveCredentials(url, passphrase);

    try {
      await api.list();
      // A different deployment means a different sheet; the cache from the old
      // one would linger as ghost rows until the next full sync.
      if (changed) reset();
      dismissible = true;
      closeDialog(dialog);
      onConnected();
    } catch (error) {
      if (previous) saveCredentials(previous.url, previous.passphrase);
      else clearCredentials();
      showError(error.message);
    } finally {
      setBusy(false);
    }
  });
}
