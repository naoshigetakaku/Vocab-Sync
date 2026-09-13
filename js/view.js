/**
 * view.js — what the home screen is showing.
 *
 * Two independent choices: which words (the All / Known / Unknown tab) and how
 * (a list, or cards). The tab is remembered across launches like the sort
 * order; the mode is not, so the app always opens on the list.
 */

import { FILTERS, STORAGE_KEYS } from './config.js';
import { readJson, writeJson } from './storage.js';

const listeners = new Set();

function isFilter(value) {
  return FILTERS.some((entry) => entry.value === value);
}

let filter = readJson(STORAGE_KEYS.filter, 'all');
if (!isFilter(filter)) filter = 'all';

let mode = 'list';

export function subscribeView(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

/** 'all', 'known' or 'unknown'. */
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
 * Known or Unknown files it there, so it does not vanish from the screen it
 * was added on.
 */
export function statusForNewWord() {
  return filter === 'all' ? '' : filter;
}

/** 'list' or 'cards'. */
export function getMode() {
  return mode;
}

export function setMode(next) {
  if (next === mode) return;
  mode = next;
  emit();
}
