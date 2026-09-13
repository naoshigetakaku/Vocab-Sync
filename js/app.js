/**
 * app.js — bootstrap and event wiring.
 */

import { hasCredentials } from './auth.js';
import { isRetryable, isBackendStale, getBackendVersion } from './api.js';
import { subscribe, refresh, reset, getWord, setStatus } from './store.js';
import { FILTERS, STATUS_KNOWN, STATUS_UNKNOWN } from './config.js';
import { subscribeView, getFilter, setFilter, getMode, setMode } from './view.js';
import {
  initList, render as renderList, highlightNew, animateNextReflow, flashRow,
} from './list.js';
import { initCards, renderCards, shuffleCards } from './cards.js';
import { initDetail, openDetail, syncDetail } from './detail.js';
import { initForm, openCreateForm, openEditForm } from './form.js';
import { initSetup, openSetup } from './setup.js';
import { initInstallHint } from './install-hint.js';
import { initSort, openSortPicker } from './sort.js';
import { initPicker } from './picker.js';
import { initConfirm } from './confirm.js';
import { enableRowSwipe, RIGHT } from './swipe-row.js';
import { toast } from './toast.js';

const addButton = document.getElementById('add-button');
const settingsButton = document.getElementById('settings-button');
const sortButton = document.getElementById('sort-button');
const wordListElement = document.getElementById('word-list');
const cardsElement = document.getElementById('cards');
const mainElement = document.querySelector('.app-main');
const modeButton = document.getElementById('mode-button');
const modeIconList = document.getElementById('mode-icon-list');
const modeIconCards = document.getElementById('mode-icon-cards');
const filterElement = document.getElementById('filter');

const VIEW_ANIMATION_MS = 420;

let syncing = false;
let staleWarningShown = false;
let previousFilter = getFilter();
let previousMode = getMode();

/**
 * Saving Code.gs in the editor is not the same as deploying it, and a stale
 * deployment fails quietly: the row is written without the columns it does not
 * know about. Say so rather than letting the user wonder.
 */
function warnIfBackendStale() {
  if (staleWarningShown || !isBackendStale()) return;
  staleWarningShown = true;
  toast('Apps Script is out of date (v' + getBackendVersion() + '). Some fields will not save — see Connection.');
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

/* --- Screen --------------------------------------------------------------- */

function filterIndex(value) {
  return Math.max(0, FILTERS.findIndex((entry) => entry.value === value));
}

function paintHeader() {
  const cards = getMode() === 'cards';

  // The button offers the mode you are not in.
  //
  // toggleAttribute, not .hidden: `hidden` is an IDL property of HTMLElement,
  // and these are SVG elements — assigning to .hidden there sets a plain
  // JavaScript property and changes nothing on screen.
  modeIconList.toggleAttribute('hidden', !cards);
  modeIconCards.toggleAttribute('hidden', cards);
  modeButton.setAttribute('aria-label', cards ? 'Switch to list' : 'Switch to cards');

  const filter = getFilter();
  filterElement.dataset.active = filter;
  filterElement.style.setProperty('--filter-index', String(filterIndex(filter)));
  filterElement.querySelectorAll('.filter__tab').forEach((tab) => {
    tab.setAttribute('aria-selected', tab.dataset.filter === filter ? 'true' : 'false');
  });
}

/** Slides the arriving content in from the side it came from. */
function animateView(element, kind) {
  const classes = ['view-in-forward', 'view-in-back', 'view-in-fade'];
  element.classList.remove(...classes);
  // Force a reflow so the animation restarts even on a rapid back-and-forth.
  void element.offsetWidth;
  element.classList.add('view-in-' + kind);
  setTimeout(() => element.classList.remove(...classes), VIEW_ANIMATION_MS);
}

function renderCurrent() {
  const cards = getMode() === 'cards';
  const filter = getFilter();

  // A different tab or mode is a different screen: start it at the top, and
  // enter it from the side of the tab that was tapped.
  let entrance = null;
  if (filter !== previousFilter) {
    entrance = filterIndex(filter) > filterIndex(previousFilter) ? 'forward' : 'back';
  } else if (cards !== (previousMode === 'cards')) {
    entrance = 'fade';
  }
  previousFilter = filter;
  previousMode = getMode();

  wordListElement.hidden = cards;
  cardsElement.hidden = !cards;
  // The deck does its own snap scrolling, so the page must stop scrolling.
  mainElement.classList.toggle('is-cards', cards);

  if (cards) renderCards();
  else renderList();

  paintHeader();

  if (entrance) {
    mainElement.scrollTop = 0;
    cardsElement.scrollTop = 0;
    animateView(cards ? cardsElement : wordListElement, entrance);
  }
}

/* --- Known / unknown ------------------------------------------------------ */

function statusFor(direction) {
  return direction === RIGHT ? STATUS_KNOWN : STATUS_UNKNOWN;
}

/** Only a swipe that would change the word's pile is offered. */
function allowsSwipe(id, direction) {
  const word = getWord(id);
  return Boolean(word) && (word.status || '') !== statusFor(direction);
}

/** Under All the word is still on screen afterwards; under a tab it leaves. */
function staysAfterSwipe() {
  return getFilter() === 'all';
}

async function performSwipe(id, direction) {
  const status = statusFor(direction);
  const stays = staysAfterSwipe();

  // Either the row takes its new colour where it is, or the rows after it
  // glide up into the gap it leaves.
  if (stays) flashRow(id);
  else animateNextReflow();

  try {
    await setStatus(id, status);
    if (!stays) toast(status === STATUS_KNOWN ? 'Moved to Known.' : 'Moved to Unknown.');
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

  initList(openDetail);
  initCards();
  initDetail({ onEdit: openEditForm });
  initForm({
    afterSave: (saved) => {
      if (saved) highlightNew(saved.id);
      renderCurrent();
      syncDetail();
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

  addButton.addEventListener('click', openCreateForm);
  sortButton.addEventListener('click', openSortPicker);
  settingsButton.addEventListener('click', () => openSetup({ manual: true }));

  filterElement.addEventListener('click', (event) => {
    const tab = event.target.closest('.filter__tab');
    if (tab) setFilter(tab.dataset.filter);
  });

  modeButton.addEventListener('click', () => {
    const toCards = getMode() !== 'cards';
    // A fresh deal every time the deck is opened, which is the point of it.
    if (toCards) shuffleCards();
    setMode(toCards ? 'cards' : 'list');
  });

  // Right for known, left for unknown. The cards are not a list, so there is
  // nothing to swipe there.
  enableRowSwipe(wordListElement, {
    canSwipe: () => getMode() === 'list',
    allows: allowsSwipe,
    stays: staysAfterSwipe,
    perform: performSwipe,
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
