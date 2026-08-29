/**
 * list.js — the home screen.
 *
 * Deliberately shows the word and nothing else; every other field lives behind
 * the detail dialog.
 */

import { getWords } from './store.js';
import { sortWords } from './sort.js';
import { DEFAULT_COLOR } from './config.js';

const listElement = document.getElementById('word-list');
const emptyElement = document.getElementById('empty-state');
const countElement = document.getElementById('word-count');

let staggerDone = false;
let staggerTimer;
let newestId = null;

function buildRow(word) {
  const item = document.createElement('li');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-row';
  if (word.pending) button.classList.add('word-row--pending');
  if (word.id === newestId) button.classList.add('is-new');
  button.dataset.id = word.id;
  // The colour is applied through the attribute so the stylesheet keeps
  // control of the actual shade in each theme.
  button.dataset.color = word.color || DEFAULT_COLOR;
  // textContent, never innerHTML — the content comes from a shared sheet.
  button.textContent = word.word;

  item.appendChild(button);
  return item;
}

export function render() {
  const words = sortWords(getWords());

  const fragment = document.createDocumentFragment();
  words.forEach((word) => fragment.appendChild(buildRow(word)));
  listElement.replaceChildren(fragment);

  countElement.textContent = words.length ? String(words.length) : '';
  emptyElement.hidden = words.length !== 0;

  // Stagger the entrance once per session, not on every re-render.
  if (!staggerDone && words.length) {
    staggerDone = true;
    listElement.classList.add('is-entering');
    clearTimeout(staggerTimer);
    staggerTimer = setTimeout(() => listElement.classList.remove('is-entering'), 900);
  }

  newestId = null;
}

/** Called after a create so the new row animates in on its own. */
export function highlightNew(id) {
  newestId = id;
}

export function initList(onSelect) {
  listElement.addEventListener('click', (event) => {
    const row = event.target.closest('.word-row');
    if (row && row.dataset.id) onSelect(row.dataset.id);
  });
}
