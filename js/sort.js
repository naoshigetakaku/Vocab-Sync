/**
 * sort.js — ordering of the word list.
 *
 * The control lives inside the folder settings menu now, so this module owns
 * the mode and the picker, not a button.
 */

import { STORAGE_KEYS } from './config.js';
import { readJson, writeJson } from './storage.js';
import { openPicker } from './picker.js';

const MODES = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'az', label: 'A–Z' },
  { value: 'za', label: 'Z–A' },
];

const COMPARATORS = {
  newest: (a, b) => byDate(b, a),
  oldest: (a, b) => byDate(a, b),
  az: (a, b) => byWord(a, b),
  za: (a, b) => byWord(b, a),
};

function byDate(a, b) {
  const result = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  // Same timestamp: fall back to the word so the order never flickers.
  return result !== 0 ? result : byWord(a, b);
}

function byWord(a, b) {
  return String(a.word || '').localeCompare(String(b.word || ''), undefined, {
    sensitivity: 'base',
  });
}

function isKnown(value) {
  return MODES.some((mode) => mode.value === value);
}

let current = readJson(STORAGE_KEYS.sort, 'newest');
if (!isKnown(current)) current = 'newest';

let onChange = () => {};

export function getSortMode() {
  return current;
}

/** Wording for the settings menu, which shows the mode in place. */
export function getSortLabel() {
  const mode = MODES.find((entry) => entry.value === current);
  return mode ? mode.label : '';
}

export function sortWords(words) {
  return words.slice().sort(COMPARATORS[current]);
}

export function initSort(handler) {
  onChange = handler || (() => {});
}

export function openSortPicker() {
  openPicker({
    title: 'Sort by',
    options: MODES,
    value: current,
    onSelect: (value) => {
      if (!isKnown(value) || value === current) return;
      current = value;
      writeJson(STORAGE_KEYS.sort, current);
      onChange();
    },
  });
}
