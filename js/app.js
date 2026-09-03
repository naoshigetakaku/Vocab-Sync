/**
 * app.js — bootstrap and event wiring.
 */

import { hasCredentials } from './auth.js';
import { isRetryable, isBackendStale, getBackendVersion } from './api.js';
import {
  subscribe, refresh, reset,
  getFolders, findFolderByName, countUnsorted, getWordsInFolder, deleteFolder,
  setFolderPhoto,
} from './store.js';
import { UNSORTED_LABEL } from './config.js';
import {
  subscribeView, getCurrentFolder, isHome, showHome, openFolder, UNSORTED,
  getMode, setMode,
} from './view.js';
import { initList, render as renderList, visibleWords, highlightNew } from './list.js';
import { renderReel, shuffleReel } from './reel.js';
import { fileToThumbnail } from './photo.js';
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
const reelElement = document.getElementById('reel');
const mainElement = document.querySelector('.app-main');
const modeButton = document.getElementById('mode-button');
const modeIconList = document.getElementById('mode-icon-list');
const modeIconReel = document.getElementById('mode-icon-reel');
const photoInput = document.getElementById('photo-input');

let syncing = false;
let staleWarningShown = false;
let photoTarget = null;

/**
 * Saving Code.gs in the editor is not the same as deploying it, and a stale
 * deployment fails quietly: the row is written without the columns it does not
 * know about. Say so rather than letting the user wonder.
 */
function warnIfBackendStale() {
  if (staleWarningShown || !isBackendStale()) return;
  staleWarningShown = true;
  toast('Apps Script is out of date (v' + getBackendVersion() + '). Folders, photos and colours will not save — see Connection.');
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

  const reel = !home && getMode() === 'reel';

  backButton.hidden = home;
  // Sorting has no meaning once the order is deliberately random.
  sortButton.hidden = home || reel;
  modeButton.hidden = home;
  // The unsorted pile is not a real folder, so it cannot be renamed or removed.
  folderMenuButton.hidden = home || target === UNSORTED;
  // Connection lives on the home screen; a folder's header is crowded enough.
  settingsButton.hidden = !home;

  // The button offers the mode you are not in.
  //
  // toggleAttribute, not .hidden: `hidden` is an IDL property of HTMLElement,
  // and these are SVG elements — assigning to .hidden there sets a plain
  // JavaScript property and changes nothing on screen.
  modeIconList.toggleAttribute('hidden', !reel);
  modeIconReel.toggleAttribute('hidden', reel);
  modeButton.setAttribute('aria-label', reel ? 'Switch to list' : 'Switch to reel');

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
  const reel = !home && getMode() === 'reel';

  gridElement.hidden = !home;
  wordListElement.hidden = home || reel;
  reelElement.hidden = !reel;
  // The reel does its own snap scrolling, so the page must stop scrolling.
  mainElement.classList.toggle('is-reel', reel);
  if (!home) foldersEmpty.hidden = true;

  if (home) renderFolders();
  else if (reel) renderReel();
  else renderList();

  paintHeader();
}

/* --- Folder actions ------------------------------------------------------- */

function openFolderMenu() {
  const name = currentFolderLabel();
  const folder = findFolderByName(name);
  if (!folder) return;

  const options = [
    { value: 'rename', label: 'Rename folder' },
    { value: 'photo', label: folder.photo ? 'Change photo' : 'Set photo' },
  ];
  if (folder.photo) options.push({ value: 'removePhoto', label: 'Remove photo' });
  options.push({ value: 'delete', label: 'Delete folder' });

  openPicker({
    title: name,
    options,
    value: '',
    onSelect: (choice) => {
      if (choice === 'rename') {
        setTimeout(() => openRenameFolder(folder), 180);
      } else if (choice === 'photo') {
        // Opened straight from the tap: wrapping this in a timer would break
        // the user gesture that Safari requires to show the file picker.
        photoTarget = folder.id;
        photoInput.value = '';
        photoInput.click();
      } else if (choice === 'removePhoto') {
        setTimeout(() => clearFolderPhoto(folder), 180);
      } else if (choice === 'delete') {
        setTimeout(() => confirmDeleteFolder(folder), 180);
      }
    },
  });
}

async function clearFolderPhoto(folder) {
  try {
    await setFolderPhoto(folder.id, '');
    toast('Photo removed.');
  } catch (error) {
    toast(error.message);
  }
}

async function onPhotoChosen(event) {
  const file = event.target.files && event.target.files[0];
  const id = photoTarget;
  photoTarget = null;
  if (!file || !id) return;

  try {
    toast('Preparing photo…');
    const thumbnail = await fileToThumbnail(file);
    await setFolderPhoto(id, thumbnail);
    toast('Photo set.');
  } catch (error) {
    toast(error.message);
  } finally {
    event.target.value = '';
  }
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
  photoInput.addEventListener('change', onPhotoChosen);

  modeButton.addEventListener('click', () => {
    const toReel = getMode() !== 'reel';
    // A fresh deal every time the reel is opened, which is the point of it.
    if (toReel) shuffleReel();
    setMode(toReel ? 'reel' : 'list');
  });
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
