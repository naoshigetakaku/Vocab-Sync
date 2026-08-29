/**
 * app.js — bootstrap and event wiring.
 */

import { hasCredentials } from './auth.js';
import { isRetryable, isBackendStale, getBackendVersion } from './api.js';
import { subscribe, refresh, reset } from './store.js';
import { initList, render, highlightNew } from './list.js';
import { initDetail, openDetail, syncDetail } from './detail.js';
import { initForm, openCreateForm, openEditForm } from './form.js';
import { initSetup, openSetup } from './setup.js';
import { initInstallHint } from './install-hint.js';
import { initThemeColor } from './theme-color.js';
import { initSort } from './sort.js';
import { initPicker } from './picker.js';
import { initConfirm } from './confirm.js';
import { toast } from './toast.js';

const addButton = document.getElementById('add-button');
const settingsButton = document.getElementById('settings-button');

let syncing = false;
let staleWarningShown = false;

/**
 * Saving Code.gs in the editor is not the same as deploying it, and a stale
 * deployment fails quietly: the row is written without the columns it does not
 * know about. Say so rather than letting the user wonder.
 */
function warnIfBackendStale() {
  if (staleWarningShown || !isBackendStale()) return;
  staleWarningShown = true;
  toast('Apps Script is out of date (v' + getBackendVersion() + '). Colours will not save — see Connection.');
}

/**
 * Pull from the sheet.
 *
 * `quiet` suppresses only the offline-style failures; anything the server
 * actively rejected is always surfaced, because it needs the user to act.
 */
async function sync(quiet) {
  if (syncing || !hasCredentials()) return;
  syncing = true;

  try {
    await refresh();
    warnIfBackendStale();
  } catch (error) {
    if (error.code === 'UNAUTHORIZED' || error.code === 'NOT_CONFIGURED') {
      reset();
      toast(error.message);
      openSetup();
    } else if (!quiet || !isRetryable(error)) {
      toast(error.message);
    }
  } finally {
    syncing = false;
  }
}

/* --- Service worker ------------------------------------------------------- */

/**
 * A new worker installs, activates and claims this page on its own; all that
 * is left here is to reload once so the running code matches the shell that
 * has just taken over.
 */
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Offline support is a bonus; the app works fine without it.
  });

  // On the very first install the worker claims the page without an update
  // having happened; reloading then would be a pointless flash.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;

    // Never yank the page out from under someone mid-entry.
    if (document.querySelector('dialog[open]')) {
      const retry = setInterval(() => {
        if (!document.querySelector('dialog[open]')) {
          clearInterval(retry);
          window.location.reload();
        }
      }, 1000);
      return;
    }

    window.location.reload();
  });
}

/* --- Start ---------------------------------------------------------------- */

function wireUi() {
  // Before anything can open a dialog, so the chrome colour has a baseline.
  initThemeColor();

  subscribe(render);

  // Shared dialogs first: the views below open them.
  initPicker();
  initConfirm();

  initList(openDetail);
  initDetail({ onEdit: openEditForm });
  initForm({
    afterSave: (saved) => {
      if (saved) highlightNew(saved.id);
      render();
      syncDetail();
    },
  });
  initSetup({
    onConnected: () => {
      toast('Connected.');
      sync(false);
    },
  });
  initInstallHint();
  initSort(render);

  addButton.addEventListener('click', openCreateForm);
  settingsButton.addEventListener('click', () => openSetup({ manual: true }));

  // iOS suspends standalone web apps aggressively; re-sync whenever the app
  // comes back to the foreground rather than polling on a timer.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync(true);
  });
  window.addEventListener('online', () => sync(true));

  // Paint the cached list first, then reconcile with the sheet.
  render();

  if (hasCredentials()) sync(true);
  else openSetup();
}

function start() {
  // The updater has to run even when the interface fails to come up. Without
  // this, one bad release can never be replaced by a good one: the code that
  // fetches the fix is the same code that just crashed.
  try {
    wireUi();
  } catch (error) {
    console.error('VocabSync: interface failed to initialise.', error);
  }

  initServiceWorker();
}

start();
