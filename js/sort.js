/**
 * sort.js — ordering of the word list.
 *
 * One button that cycles through the modes, rather than a menu: the whole set
 * is four options and a single tap is faster than opening a picker.
 */

import { STORAGE_KEYS } from './config.js';
import { readJson, writeJson } from './storage.js';

const MODES = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'az', label: 'A–Z' },
  { id: 'za', label: 'Z–A' },
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

function indexOfMode(id) {
  const index = MODES.findIndex((mode) => mode.id === id);
  return index === -1 ? 0 : index;
}

let current = indexOfMode(readJson(STORAGE_KEYS.sort, 'newest'));

export function getMode() {
  return MODES[current].id;
}

export function sortWords(words) {
  return words.slice().sort(COMPARATORS[getMode()]);
}

export function initSort(onChange) {
  const button = document.getElementById('sort-button');
  const label = document.getElementById('sort-label');
  if (!button || !label) return;

  const paint = (animate) => {
    label.textContent = MODES[current].label;
    button.setAttribute('aria-label', 'Sort: ' + MODES[current].label + '. Tap to change.');

    if (!animate) return;
    label.classList.remove('is-changed');
    // Force a reflow so the animation restarts on every tap.
    void label.offsetWidth;
    label.classList.add('is-changed');
  };

  button.addEventListener('click', () => {
    current = (current + 1) % MODES.length;
    writeJson(STORAGE_KEYS.sort, getMode());
    paint(true);
    onChange();
  });

  paint(false);
}
