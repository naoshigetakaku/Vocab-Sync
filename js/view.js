/**
 * view.js — what the screen is showing.
 *
 * Two independent choices:
 *   - which words the list shows, All or Archived — remembered across
 *     launches;
 *   - which tab is up, List, Cards or Quiz — not remembered, so the app
 *     always opens on the list.
 *
 * There used to be a third: which folder was open. Folders are gone. The
 * sheet still carries the column, untouched, so a word remembers where it
 * came from even though nothing here asks.
 */

import { FILTERS, FILTER_ARCHIVED, STORAGE_KEYS } from './config.js';
import { readJson, writeJson } from './storage.js';
import { getLiveWords, getArchivedWords } from './store.js';

const listeners = new Set();

function isFilter(value) {
  return FILTERS.some((entry) => entry.value === value);
}

let filter = readJson(STORAGE_KEYS.filter, 'all');
if (!isFilter(filter)) filter = 'all';

/** 'list', 'cards' or 'quiz'. */
let tab = 'list';

export function subscribeView(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

/**
 * Every live word: the ones on the list under All, and the only ones the
 * quiz ever asks about. Archived words are still in the sheet; they are
 * simply not in circulation.
 */
export function wordsInScope() {
  return getLiveWords();
}

/** Everything put aside, for the Archived tab. */
export function archivedInScope() {
  return getArchivedWords();
}

/* --- All / Archived ------------------------------------------------------ */

/** 'all' or 'archived'. */
export function getFilter() {
  return filter;
}

export function setFilter(next) {
  if (!isFilter(next) || next === filter) return;
  filter = next;
  writeJson(STORAGE_KEYS.filter, filter);
  emit();
}

/** True while the list is showing archived words rather than live ones. */
export function isArchivedFilter() {
  return filter === FILTER_ARCHIVED;
}

/* --- List / Cards / Quiz -------------------------------------------------- */

/** Which of the three tabs is up. */
export function getTab() {
  return tab;
}

export function setTab(next) {
  if (next === tab) return;
  tab = next;
  emit();
}
