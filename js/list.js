/**
 * list.js — the home screen.
 *
 * Deliberately shows the word and nothing else; every other field lives behind
 * the detail dialog.
 */

import { getWordsInFolder } from './store.js';
import { sortWords } from './sort.js';
import { getCurrentFolder, UNSORTED } from './view.js';
import { DEFAULT_COLOR, ARCHIVE_FOLDER } from './config.js';

const listElement = document.getElementById('word-list');
const emptyElement = document.getElementById('empty-state');

let staggerDone = false;
let staggerTimer;
let newestId = null;
let reflowNext = false;
let reflowUntil = 0;
let lastSignature = '';

/** Must match .word-item.is-reflowing in layout.css. */
const REFLOW_MS = 260;

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
  actionLabel.textContent =
    getCurrentFolder() === ARCHIVE_FOLDER ? 'Unarchive' : 'Archive';

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

/** True in the wide browser layout, where the list is a grid of cells. */
function isMultiColumn() {
  return getComputedStyle(listElement).gridTemplateColumns.split(' ').length > 1;
}

/** Where each row sits now, keyed by word id. */
function measureRows() {
  const boxes = new Map();
  listElement.querySelectorAll('.word-row').forEach((row) => {
    boxes.set(row.dataset.id, row.closest('.word-item').getBoundingClientRect());
  });
  return boxes;
}

/**
 * Slides each row from where it was to where it now is.
 *
 * In a single column a row that leaves takes its gap with it, and nothing
 * else moves sideways. In a grid every row after it shifts back one cell —
 * some of them up a line and across the page — which reads as a jump unless
 * the move is shown.
 */
function playReflow(before) {
  const moved = [];

  listElement.querySelectorAll('.word-row').forEach((row) => {
    const was = before.get(row.dataset.id);
    if (!was) return;
    const item = row.closest('.word-item');
    const now = item.getBoundingClientRect();
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    item.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    moved.push(item);
  });

  if (!moved.length) return;
  reflowUntil = performance.now() + REFLOW_MS;

  // Commit the starting offsets before they are released, or the browser
  // folds both steps into one style change and nothing animates.
  void listElement.offsetWidth;

  moved.forEach((item) => {
    item.classList.add('is-reflowing');
    item.style.removeProperty('transform');
  });

  setTimeout(() => {
    moved.forEach((item) => item.classList.remove('is-reflowing'));
  }, REFLOW_MS + 60);
}

/** Everything a row shows, so an identical render can be recognised. */
function signatureOf(words) {
  return getCurrentFolder() + '\n' + words
    .map((word) => [word.id, word.word, word.color, word.pending ? 1 : 0].join('\t'))
    .join('\n');
}

export function render() {
  const words = visibleWords();

  // The store notifies on every change anywhere — the server confirming a
  // word that has just left this folder, a background sync that found nothing
  // new. Rebuilding for those would restart whatever the rows are doing: a
  // slide into a new cell, a swipe under the finger.
  const signature = signatureOf(words);
  if (signature === lastSignature && newestId === null && listElement.childElementCount) {
    emptyElement.hidden = words.length !== 0 || getCurrentFolder() === null;
    reflowNext = false;
    return;
  }
  lastSignature = signature;

  // A real change landing mid-slide — a sync bringing in an edit from another
  // device — would otherwise swap in fresh rows at their final spots and cut
  // the slide off. Measured boxes include the transform in flight, so the new
  // rows carry on from wherever the old ones had got to.
  const sliding = performance.now() < reflowUntil;
  const before = (reflowNext || sliding) && isMultiColumn() ? measureRows() : null;
  reflowNext = false;

  const fragment = document.createDocumentFragment();
  words.forEach((word) => fragment.appendChild(buildRow(word)));
  listElement.replaceChildren(fragment);

  if (before) playReflow(before);

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

/** Called before a row is moved out, so the rest glide into its place. */
export function animateNextReflow() {
  reflowNext = true;
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
