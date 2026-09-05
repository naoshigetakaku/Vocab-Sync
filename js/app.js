/**
 * app.js — bootstrap and event wiring.
 */

import { hasCredentials } from './auth.js';
import { isRetryable, isBackendStale, getBackendVersion } from './api.js';
import {
  subscribe, refresh, reset,
  findFolderByName, getWordsInFolder, deleteFolder, setFolderPhoto,
  archiveWord, unarchiveWord, unarchiveDestination, getWord,
} from './store.js';
import { UNSORTED_LABEL, ARCHIVE_FOLDER } from './config.js';
import {
  subscribeView, getCurrentFolder, isHome, showHome, openFolder, UNSORTED,
  getMode, setMode,
} from './view.js';
import { initList, render as renderList, visibleWords, highlightNew } from './list.js';
import { initFolderGrid, renderFolders } from './folder-grid.js';
import { initFolderForm, openCreateFolder, openRenameFolder } from './folder-form.js';
import { initDetail, openDetail, syncDetail } from './detail.js';
import { initForm, openCreateForm, openEditForm } from './form.js';
import { initSetup, openSetup } from './setup.js';
import { initInstallHint } from './install-hint.js';
import { initSort, openSortPicker, getSortLabel } from './sort.js';
import { initPicker, openPicker } from './picker.js';
import { initConfirm, askConfirm } from './confirm.js';
import { renderReel, shuffleReel } from './reel.js';
import { enableRowSwipe } from './swipe-row.js';
import { fileToThumbnail } from './photo.js';
import { fitOneLine } from './fit-text.js';
import { enableBackSwipe } from './nav-swipe.js';
import { toast } from './toast.js';

const addButton = document.getElementById('add-button');
const settingsButton = document.getElementById('settings-button');
const folderSettingsButton = document.getElementById('folder-settings-button');
const titleElement = document.getElementById('app-title');
const gridElement = document.getElementById('folder-grid');
const foldersEmpty = document.getElementById('folders-empty');
const wordListElement = document.getElementById('word-list');
const reelElement = document.getElementById('reel');
const mainElement = document.querySelector('.app-main');
const modeButton = document.getElementById('mode-button');
const modeIconList = document.getElementById('mode-icon-list');
const modeIconReel = document.getElementById('mode-icon-reel');
const photoInput = document.getElementById('photo-input');

const VIEW_ANIMATION_MS = 420;

let syncing = false;
let staleWarningShown = false;
let photoTarget = null;
let previousHome = true;

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

  modeButton.hidden = home;
  folderSettingsButton.hidden = home;
  // Connection lives on the home screen; a folder's header is the name plus
  // exactly two controls.
  settingsButton.hidden = !home;

  // The button offers the mode you are not in.
  //
  // toggleAttribute, not .hidden: `hidden` is an IDL property of HTMLElement,
  // and these are SVG elements — assigning to .hidden there sets a plain
  // JavaScript property and changes nothing on screen.
  modeIconList.toggleAttribute('hidden', !reel);
  modeIconReel.toggleAttribute('hidden', reel);
  modeButton.setAttribute('aria-label', reel ? 'Switch to list' : 'Switch to reel');

  // The title gets the whole line to itself on both screens, so it can be
  // fitted to it.
  if (home) {
    titleElement.textContent = 'Folders';
    addButton.setAttribute('aria-label', 'New folder');
    folderSettingsButton.setAttribute('aria-label', 'Folder settings');
  } else {
    titleElement.textContent = currentFolderLabel();
    addButton.setAttribute('aria-label', 'Add a word');
    folderSettingsButton.setAttribute('aria-label', currentFolderLabel() + ' settings');
  }

  titleElement.classList.toggle('is-tappable', !home);

  fitOneLine(titleElement, 15);
}

/** Slides the arriving screen in from the side it came from. */
function animateView(element, direction) {
  element.classList.remove('view-in-forward', 'view-in-back');
  // Force a reflow so the animation restarts even on a rapid back-and-forth.
  void element.offsetWidth;
  element.classList.add(direction === 'forward' ? 'view-in-forward' : 'view-in-back');
  setTimeout(() => {
    element.classList.remove('view-in-forward', 'view-in-back');
  }, VIEW_ANIMATION_MS);
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

  const direction = previousHome === home ? null : (home ? 'back' : 'forward');
  previousHome = home;

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

  if (direction) {
    animateView(home ? gridElement : (reel ? reelElement : wordListElement), direction);
  }
}

/* --- Folder settings ------------------------------------------------------ */

function openFolderSettings() {
  const target = getCurrentFolder();
  if (target === null) return;

  const unsorted = target === UNSORTED;
  const folder = unsorted ? null : findFolderByName(target);
  if (!unsorted && !folder) return;

  const options = [
    { value: 'sort', label: 'Sort: ' + getSortLabel() },
  ];

  if (folder) {
    options.push({ value: 'rename', label: 'Rename folder' });
    options.push({ value: 'photo', label: folder.photo ? 'Change photo' : 'Set photo' });
    if (folder.photo) options.push({ value: 'removePhoto', label: 'Remove photo' });
    options.push({ value: 'delete', label: 'Delete folder' });
  }

  openPicker({
    title: unsorted ? UNSORTED_LABEL : folder.name,
    options,
    value: '',
    onSelect: (choice) => {
      if (choice === 'sort') {
        setTimeout(openSortPicker, 180);
      } else if (choice === 'rename') {
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

function inArchive() {
  return getCurrentFolder() === ARCHIVE_FOLDER;
}

/**
 * Archiving asks first; taking something back out does not.
 *
 * The asymmetry is deliberate. Archiving makes a word disappear from the list
 * you are reading, which is worth a beat of hesitation. Unarchiving puts one
 * back where you can see it, and undoing that is another swipe away.
 */
function confirmSwipe(id) {
  if (inArchive()) return Promise.resolve(true);

  const word = getWord(id);
  return askConfirm({
    title: 'Archive this word?',
    text: word ? '“' + word.word + '” moves to ' + ARCHIVE_FOLDER + '. Nothing is deleted.' : '',
    accept: 'Archive',
    tone: 'normal',
  });
}

async function performSwipe(id) {
  const archived = inArchive();
  // Read the destination before the move; afterwards the origin is cleared.
  const destination = archived ? unarchiveDestination(id) : '';

  try {
    if (archived) {
      await unarchiveWord(id);
      toast('Moved to ' + (destination || UNSORTED_LABEL) + '.');
    } else {
      await archiveWord(id);
      toast('Archived.');
    }
  } catch (error) {
    toast(error.message);
  }
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
    afterSave: (saved) => {
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
  initSort(renderCurrent);
  initInstallHint();

  addButton.addEventListener('click', () => {
    if (isHome()) openCreateFolder();
    else openCreateForm();
  });
  folderSettingsButton.addEventListener('click', openFolderSettings);
  settingsButton.addEventListener('click', () => openSetup({ manual: true }));
  photoInput.addEventListener('change', onPhotoChosen);

  modeButton.addEventListener('click', () => {
    const toReel = getMode() !== 'reel';
    // A fresh deal every time the reel is opened, which is the point of it.
    if (toReel) shuffleReel();
    setMode(toReel ? 'reel' : 'list');
  });

  // The folder slides off under the finger; the grid then enters from the left
  // as its own movement, which is what makes the hand-off read as continuous
  // rather than ending in a jump.
  enableBackSwipe(mainElement, document.body, () => !isHome(), showHome);

  // Leftwards on a row files it away — into the archive, or back out of it.
  // The reel is not a list, so there is nothing to swipe there.
  enableRowSwipe(wordListElement, {
    canSwipe: () => !isHome() && getMode() !== 'reel',
    confirm: confirmSwipe,
    perform: performSwipe,
  });

  // Without a back arrow or a menu entry, the swipe is the only way out — and
  // there is no swipe on a mouse. The folder name doubles as the way back.
  titleElement.addEventListener('click', () => {
    if (!isHome()) showHome();
  });

  // Folder names are fitted to the width they have, so a rotation or a resized
  // window has to re-measure them.
  window.addEventListener('resize', () => {
    fitOneLine(titleElement, 15);
    renderFolders();
  });

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
