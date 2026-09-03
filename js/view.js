/**
 * view.js — which screen is showing.
 *
 * Two states only: the folder grid, or one folder's word list. Kept in memory,
 * so relaunching the app always lands on the grid.
 */

const listeners = new Set();

/** null means the folder grid. UNSORTED means the bucket for filed-nowhere. */
export const UNSORTED = Symbol('unsorted');

let current = null;
let mode = 'list';

export function subscribeView(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener(current));
}

/** null on the grid; a folder name, or UNSORTED, inside one. */
export function getCurrentFolder() {
  return current;
}

export function isHome() {
  return current === null;
}

/** The name to store on a word created here; unsorted words carry none. */
export function folderNameForNewWord() {
  return typeof current === 'string' ? current : '';
}

/** 'list' or 'reel'; only meaningful inside a folder. */
export function getMode() {
  return mode;
}

export function setMode(next) {
  if (next === mode) return;
  mode = next;
  emit();
}

export function showHome() {
  if (current === null) return;
  current = null;
  emit();
}

export function openFolder(nameOrUnsorted) {
  current = nameOrUnsorted;
  // Always arrive at the list; the reel is something you opt into.
  mode = 'list';
  emit();
}
