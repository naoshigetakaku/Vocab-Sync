/**
 * list.js — the home screen.
 *
 * Deliberately shows the word and nothing else; every other field lives behind
 * the detail dialog.
 */

import { getWordsInFolder } from './store.js';
import { sortWords } from './sort.js';
import { getCurrentFolder, UNSORTED } from './view.js';
import { DEFAULT_COLOR } from './config.js';

const listElement = document.getElementById('word-list');
const emptyElement = document.getElementById('empty-state');

let staggerDone = false;
let staggerTimer;
let newestId = null;

function buildRow(word) {
  const item = document.createElement('li');
  item.className = 'word-item';

  // Sits behind the row and is uncovered as it slides; see js/swipe-row.js.
  const action = document.createElement('span');
  action.className = 'word-item__action';
  action.setAttribute('aria-hidden', 'true');

  const actionIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  actionIcon.setAttribute('viewBox', '0 0 24 24');
  actionIcon.setAttribute('class', 'word-item__icon');
  actionIcon.setAttribute('focusable', 'false');
  const box = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  box.setAttribute('d', 'M3 7h18v3H3zM5 10v9h14v-9M10 14h4');
  actionIcon.appendChild(box);

  const actionLabel = document.createElement('span');
  actionLabel.textContent = 'Archive';

  action.appendChild(actionLabel);
  action.appendChild(actionIcon);
  item.appendChild(action);

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

/** Words in the folder currently open. Returns 0 rows on the folder grid. */
export function visibleWords() {
  const target = getCurrentFolder();
  if (target === null) return [];
  return sortWords(getWordsInFolder(target === UNSORTED ? null : target));
}

export function render() {
  const words = visibleWords();

  const fragment = document.createDocumentFragment();
  words.forEach((word) => fragment.appendChild(buildRow(word)));
  listElement.replaceChildren(fragment);

  emptyElement.hidden = words.length !== 0 || getCurrentFolder() === null;

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
