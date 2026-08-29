/**
 * sort.js — ordering of the word list.
 *
 * The mode is chosen from the shared picker rather than cycled on tap, so the
 * whole set is visible and reachable in one step.
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

/** Shorter wording for the header button, where space is tight. */
const SHORT_LABELS = {
  newest: 'Newest',
  oldest: 'Oldest',
  az: 'A–Z',
  za: 'Z–A',
};

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

export function getMode() {
  return current;
}

export function sortWords(words) {
  return words.slice().sort(COMPARATORS[current]);
}

export function initSort(onChange) {
  const button = document.getElementById('sort-button');
  const label = document.getElementById('sort-label');
  if (!button || !label) return;

  const paint = (animate) => {
    label.textContent = SHORT_LABELS[current];
    button.setAttribute('aria-label', 'Sort: ' + SHORT_LABELS[current] + '. Tap to change.');

    if (!animate) return;
    label.classList.remove('is-changed');
    // Force a reflow so the animation restarts on every change.
    void label.offsetWidth;
    label.classList.add('is-changed');
  };

  button.addEventListener('click', () => {
    openPicker({
      title: 'Sort by',
      options: MODES,
      value: current,
      onSelect: (value) => {
        if (!isKnown(value) || value === current) return;
        current = value;
        writeJson(STORAGE_KEYS.sort, current);
        paint(true);
        onChange();
      },
    });
  });

  paint(false);
}
