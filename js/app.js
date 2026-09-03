/**
 * app.js — bootstrap and event wiring.
 */

import { hasCredentials } from './auth.js';
import { isRetryable, isBackendStale, getBackendVersion } from './api.js';
import {
  subscribe, refresh, reset,
  getFolders, findFolderByName, countUnsorted, getWordsInFolder, deleteFolder,
} from './store.js';
import { UNSORTED_LABEL } from './config.js';
import {
  subscribeView, getCurrentFolder, isHome, showHome, openFolder, UNSORTED,
} from './view.js';
import { initList, render as renderList, visibleWords, highlightNew } from './list.js';
import { initFolderGrid, renderFolders } from './folder-grid.js';
import { initFolderForm, openCreateFolder, openRenameFolder } from './folder-form.js';
import { initDetail, openDetail, syncDetail } from './detail.js';
import { initForm, openCreateForm, openEditForm } from './form.js';
import { initSetup, openSetup } from './setup.js';
import { initInstallHint } from './install-hint.js';
import { initSort } from './sort.js';
import { initPicker, openPicker } from './picker.js';
import { initConfirm, askConfirm } from './confirm.js';
import { toast } from './toast.js';

const addButton = document.getElementById('add-button');
const settingsButton = document.getElementById('settings-button');
const backButton = document.getElementById('back-button');
const folderMenuButton = document.getElementById('folder-menu-button');
const sortButton = document.getElementById('sort-button');
const titleElement = document.getElementById('app-title');
const countElement = document.getElementById('word-count');
const gridElement = document.getElementById('folder-grid');
const foldersEmpty = document.getElementById('folders-empty');
const wordListElement = document.getElementById('word-list');

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
  toast('Apps Script is out of date (v' + getBackendVersion() + '). Folders and colours will not save — see Connection.');
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

/* --- Screens -------------------------------------------------------------- */

function currentFolderLabel() {
  const target = getCurrentFolder();
  return target === UNSORTED ? UNSORTED_LABEL : target;
}

function paintHeader() {
  const home = isHome();
  const target = getCurrentFolder();

  backButton.hidden = home;
  sortButton.hidden = home;
  // The unsorted pile is not a real folder, so it cannot be renamed or removed.
  folderMenuButton.hidden = home || target === UNSORTED;

  if (home) {
    titleElement.textContent = 'Folders';
    const tiles = getFolders().length + (countUnsorted() > 0 ? 1 : 0);
    countElement.textContent = tiles ? String(tiles) : '';
    addButton.setAttribute('aria-label', 'New folder');
  } else {
    titleElement.textContent = currentFolderLabel();
    const shown = visibleWords().length;
    countElement.textContent = shown ? String(shown) : '';
    addButton.setAttribute('aria-label', 'Add a word');
  }
}

function renderCurrent() {
  // The open folder can disappear under us — deleted on another device, or
  // cleared when the credentials change. Fall back rather than show a
  // permanently empty list.
  const target = getCurrentFolder();
  if (target !== null && target !== UNSORTED && !findFolderByName(target)) {
    showHome();
    return;
  }

  const home = isHome();

  gridElement.hidden = !home;
  wordListElement.hidden = home;
  if (!home) foldersEmpty.hidden = true;

  if (home) renderFolders();
  else renderList();

  paintHeader();
}

/* --- Folder actions ------------------------------------------------------- */

function openFolderMenu() {
  const name = currentFolderLabel();
  const folder = findFolderByName(name);
  if (!folder) return;

  openPicker({
    title: name,
    options: [
      { value: 'rename', label: 'Rename folder' },
      { value: 'delete', label: 'Delete folder' },
    ],
    value: '',
    onSelect: (choice) => {
      if (choice === 'rename') {
        setTimeout(() => openRenameFolder(folder), 180);
      } else if (choice === 'delete') {
        setTimeout(() => confirmDeleteFolder(folder), 180);
      }
    },
  });
}

async function confirmDeleteFolder(folder) {
  const count = getWordsInFolder(folder.name).length;
  const text = count === 0
    ? '“' + folder.name + '” is empty.'
    : count + (count === 1 ? ' word' : ' words') + ' will move to ' + UNSORTED_LABEL
      + '. Nothing is deleted from the sheet.';

  const confirmed = await askConfirm({
    title: 'Delete this folder?',
    text,
    accept: 'Delete',
  });
  if (!confirmed) return;

  try {
    await deleteFolder(folder.id);
    showHome();
    toast('Folder deleted.');
  } catch (error) {
    toast(error.message);
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
  subscribe(renderCurrent);
  subscribeView(renderCurrent);

  // Shared dialogs first: the views below open them.
  initPicker();
  initConfirm();

  initFolderGrid(openFolder);
  initList(openDetail);
  initDetail({ onEdit: openEditForm });
  initForm({
    afterSave: (saved) => {
      if (saved) highlightNew(saved.id);
      renderCurrent();
      syncDetail();
    },
  });
  initFolderForm({
    afterSave: (saved, wasRename) => {
      if (!saved) return renderCurrent();
      // Renaming is only reachable from inside the folder, and the view holds
      // the folder by name — so it has to follow, or it points at nothing.
      // A folder just created is almost certainly the one you want to fill.
      openFolder(saved.name);
    },
  });
  initSetup({
    onConnected: () => {
      toast('Connected.');
      sync(false);
    },
  });
  initInstallHint();

  addButton.addEventListener('click', () => {
    if (isHome()) openCreateFolder();
    else openCreateForm();
  });
  backButton.addEventListener('click', showHome);
  folderMenuButton.addEventListener('click', openFolderMenu);
  settingsButton.addEventListener('click', () => openSetup({ manual: true }));

  initSort(renderCurrent);

  // iOS suspends standalone web apps aggressively; re-sync whenever the app
  // comes back to the foreground rather than polling on a timer.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync(true);
  });
  window.addEventListener('online', () => sync(true));

  // Paint the cached data first, then reconcile with the sheet.
  renderCurrent();

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
