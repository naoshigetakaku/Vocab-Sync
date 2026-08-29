/**
 * app.js — bootstrap and event wiring.
 */

import { hasCredentials } from './auth.js';
import { isRetryable } from './api.js';
import { subscribe, refresh, reset } from './store.js';
import { initList, render, highlightNew } from './list.js';
import { initDetail, openDetail, syncDetail } from './detail.js';
import { initForm, openCreateForm, openEditForm } from './form.js';
import { initSetup, openSetup } from './setup.js';
import { initInstallHint } from './install-hint.js';
import { initSort } from './sort.js';
import { initPicker } from './picker.js';
import { initConfirm } from './confirm.js';
import { toast } from './toast.js';

const addButton = document.getElementById('add-button');
const updateBanner = document.getElementById('update-banner');
const updateReload = document.getElementById('update-reload');

let syncing = false;

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

function announceUpdate(worker) {
  updateBanner.hidden = false;
  updateReload.addEventListener(
    'click',
    () => {
      updateReload.disabled = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    },
    { once: true }
  );
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').then((registration) => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      announceUpdate(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        // A controller already present means this is an update, not a first install.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          announceUpdate(installing);
        }
      });
    });
  }).catch(() => {
    // Offline support is a bonus; the app works fine without it.
  });

  // On the very first install the worker takes control without an update
  // having happened; reloading then would be a pointless flash.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/* --- Start ---------------------------------------------------------------- */

function start() {
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

  initServiceWorker();
}

start();
