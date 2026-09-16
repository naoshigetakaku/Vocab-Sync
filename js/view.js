/**
 * view.js — what the screen is showing.
 *
 * Three independent choices:
 *   - which folder is open (or Unsorted) — shared by every tab
 *     and remembered across launches;
 *   - which words of it the list shows, All or Unknown — also remembered;
 *   - which tab is up, List or Quiz — not remembered, so the app always
 *     opens on the list.
 */

import { FILTERS, STATUS_UNKNOWN, STORAGE_KEYS, UNSORTED_LABEL } from './config.js';
import { readJson, writeJson } from './storage.js';
import { getFolders, getWordsInFolder, findFolderByName, countUnsorted } from './store.js';

export const UNSORTED = 'unsorted';
export const FOLDER = 'folder';

const listeners = new Set();

function isFilter(value) {
  return FILTERS.some((entry) => entry.value === value);
}

let filter = readJson(STORAGE_KEYS.filter, 'all');
if (!isFilter(filter)) filter = 'all';

/** { kind: 'all' } | { kind: 'unsorted' } | { kind: 'folder', name } | null */
let selection = readJson(STORAGE_KEYS.folder, null);

/** 'list', 'cards' or 'quiz'. */
let tab = 'list';

export function subscribeView(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

/* --- Folder --------------------------------------------------------------- */

/**
 * The folder that is open, settled against what the sheet actually holds.
 *
 * A remembered folder may have been renamed or deleted on another device, and
 * Unsorted stops being a place at all once its last word is filed — which is
 * how an app left on Unsorted could show nothing while every word sat in a
 * folder one tap away. Either way the first folder is where to land, and
 * Unsorted only when there are no folders to land in.
 */
export function getSelection() {
  if (selection && selection.kind === UNSORTED && countUnsorted() > 0) return selection;
  if (selection && selection.kind === FOLDER && findFolderByName(selection.name)) return selection;

  const first = getFolders()[0];
  return first ? { kind: FOLDER, name: first.name } : { kind: UNSORTED };
}

export function setSelection(next) {
  selection = next;
  writeJson(STORAGE_KEYS.folder, selection);
  emit();
}

export function isSelected(candidate) {
  const current = getSelection();
  return current.kind === candidate.kind
    && (current.kind !== FOLDER || current.name === candidate.name);
}

export function selectionLabel() {
  const current = getSelection();
  return current.kind === UNSORTED ? UNSORTED_LABEL : current.name;
}

/** Every word in the open folder, whatever the tab. */
export function wordsInScope() {
  const current = getSelection();
  return getWordsInFolder(current.kind === UNSORTED ? null : current.name);
}

/** The folder a word added right now belongs to; blank means unsorted. */
export function folderForNewWord() {
  const current = getSelection();
  return current.kind === FOLDER ? current.name : '';
}

/* --- All / Unknown ------------------------------------------------------- */

/** 'all' or 'unknown'. */
export function getFilter() {
  return filter;
}

export function setFilter(next) {
  if (!isFilter(next) || next === filter) return;
  filter = next;
  writeJson(STORAGE_KEYS.filter, filter);
  emit();
}

/**
 * The status a word added right now should start with. Adding one under
 * Unknown labels it, so it does not vanish from the screen it was added on.
 */
export function statusForNewWord() {
  return filter === STATUS_UNKNOWN ? STATUS_UNKNOWN : '';
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


