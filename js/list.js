/**
 * list.js — the home screen.
 *
 * Deliberately shows the word and nothing else; every other field lives behind
 * the detail dialog.
 */

import { getWords } from './store.js';
import { sortWords } from './sort.js';

const listElement = document.getElementById('word-list');
const emptyElement = document.getElementById('empty-state');
const noResultsElement = document.getElementById('no-results');
const countElement = document.getElementById('word-count');

let query = '';
let staggerDone = false;
let staggerTimer;
let newestId = null;

/** Matches the word first, but definition and note are searchable too. */
function matches(word) {
  if (!query) return true;
  const haystack = [word.word, word.definition, word.note, word.pos]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function buildRow(word) {
  const item = document.createElement('li');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-row';
  if (word.pending) button.classList.add('word-row--pending');
  if (word.id === newestId) button.classList.add('is-new');
  button.dataset.id = word.id;
  // textContent, never innerHTML — the content comes from a shared sheet.
  button.textContent = word.word;

  item.appendChild(button);
  return item;
}

export function render() {
  const all = sortWords(getWords());
  const visible = all.filter(matches);

  const fragment = document.createDocumentFragment();
  visible.forEach((word) => fragment.appendChild(buildRow(word)));
  listElement.replaceChildren(fragment);

  countElement.textContent = all.length ? String(all.length) : '';
  emptyElement.hidden = all.length !== 0;
  noResultsElement.hidden = !(all.length > 0 && visible.length === 0);

  // Stagger the entrance once per session; re-running it on every keystroke
  // would make the search feel sluggish.
  if (!staggerDone && visible.length) {
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

export function setQuery(value) {
  query = value.trim().toLowerCase();
  render();
}

export function initList(onSelect) {
  listElement.addEventListener('click', (event) => {
    const row = event.target.closest('.word-row');
    if (row && row.dataset.id) onSelect(row.dataset.id);
  });
}
