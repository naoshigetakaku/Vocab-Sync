/**
 * list.js — the home screen.
 *
 * Deliberately shows the word and nothing else; every other field lives behind
 * the detail dialog. Under All, a small mark says which pile a word is in.
 */

import { getWordsByStatus } from './store.js';
import { sortWords } from './sort.js';
import { getFilter } from './view.js';
import { DEFAULT_COLOR, STATUS_KNOWN, STATUS_UNKNOWN } from './config.js';

const listElement = document.getElementById('word-list');
const emptyElement = document.getElementById('empty-state');
const emptyTitle = document.getElementById('empty-title');
const emptyHint = document.getElementById('empty-hint');

const EMPTY_TEXT = {
  all: ['No words yet', 'Tap + to add your first one.'],
  [STATUS_KNOWN]: ['No known words yet', 'Swipe a word right to mark it known.'],
  [STATUS_UNKNOWN]: ['No unknown words yet', 'Swipe a word left to mark it unknown.'],
};

let staggerDone = false;
let staggerTimer;
let newestId = null;
/** { id, start } while a row is washing into its new colour; see flashRow. */
let flash = null;
let reflowNext = false;
let reflowUntil = 0;
let lastSignature = '';

/** Must match .word-item.is-reflowing in layout.css. */
const REFLOW_MS = 260;
/** Must match the flash animations in animations.css. */
const FLASH_MS = 700;

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(path) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'word-item__icon');
  svg.setAttribute('focusable', 'false');
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', path);
  svg.appendChild(line);
  return svg;
}

/**
 * The label a swipe uncovers. Known sits on the left, under a row dragged
 * right; Unknown on the right, under a row dragged left.
 */
function action(status) {
  const known = status === STATUS_KNOWN;
  const element = document.createElement('span');
  element.className = 'word-item__action word-item__action--' + status;
  element.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.textContent = known ? 'Known' : 'Unknown';
  const glyph = icon(known ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7L7 17');

  if (known) {
    element.appendChild(glyph);
    element.appendChild(label);
  } else {
    element.appendChild(label);
    element.appendChild(glyph);
  }
  return element;
}

function buildRow(word) {
  const status = word.status || '';

  const item = document.createElement('li');
  item.className = 'word-item';

  // Both sit behind the row and are uncovered as it slides; see
  // js/swipe-row.js. Only the one for the direction of travel is shown.
  item.appendChild(action(STATUS_KNOWN));
  item.appendChild(action(STATUS_UNKNOWN));

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-row';
  if (word.pending) button.classList.add('word-row--pending');
  if (word.id === newestId) button.classList.add('is-new');
  if (flash && word.id === flash.id && status) {
    const elapsed = performance.now() - flash.start;
    if (elapsed < FLASH_MS) {
      button.classList.add('is-flash-' + status);
      // A rebuild part-way through — the server confirming the change is
      // enough — picks the wash up where it was instead of starting it again.
      if (elapsed > 16) button.style.animationDelay = -Math.round(elapsed) + 'ms';
    }
  }
  button.dataset.id = word.id;
  button.dataset.status = status;
  // The colour is applied through the attribute so the stylesheet keeps
  // control of the actual shade in each theme.
  button.dataset.color = word.color || DEFAULT_COLOR;

  // textContent, never innerHTML — the content comes from a shared sheet.
  const text = document.createElement('span');
  text.className = 'word-row__text';
  text.textContent = word.word;
  button.appendChild(text);

  const mark = document.createElement('span');
  mark.className = 'word-row__mark';
  mark.setAttribute('aria-hidden', 'true');
  button.appendChild(mark);

  if (status) button.setAttribute('aria-label', word.word + ', ' + status);

  item.appendChild(button);
  return item;
}

/** Words under the current tab, in the current sort order. */
export function visibleWords() {
  return sortWords(getWordsByStatus(getFilter()));
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
  return getFilter() + '\n' + words
    .map((word) => [word.id, word.word, word.color, word.status || '', word.pending ? 1 : 0].join('\t'))
    .join('\n');
}

/** Shared with the card deck, which shows the same message. */
export function paintEmpty(count) {
  const filter = getFilter();
  const [title, hint] = EMPTY_TEXT[filter] || EMPTY_TEXT.all;
  emptyTitle.textContent = title;
  emptyHint.textContent = hint;
  emptyElement.hidden = count !== 0;
}

export function render() {
  const words = visibleWords();
  listElement.dataset.filter = getFilter();

  // The store notifies on every change anywhere — the server confirming a
  // word that has just left this tab, a background sync that found nothing
  // new. Rebuilding for those would restart whatever the rows are doing: a
  // slide into a new cell, a swipe under the finger.
  const signature = signatureOf(words);
  const flashWaiting = flash !== null && flash.start === null;
  if (signature === lastSignature && newestId === null && !flashWaiting
      && listElement.childElementCount) {
    paintEmpty(words.length);
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

  if (flashWaiting) flash.start = performance.now();

  const fragment = document.createDocumentFragment();
  words.forEach((word) => fragment.appendChild(buildRow(word)));
  listElement.replaceChildren(fragment);

  if (before) playReflow(before);

  paintEmpty(words.length);

  // Stagger the entrance once per session, not on every re-render.
  if (!staggerDone && words.length) {
    staggerDone = true;
    listElement.classList.add('is-entering');
    clearTimeout(staggerTimer);
    staggerTimer = setTimeout(() => listElement.classList.remove('is-entering'), 900);
  }

  newestId = null;
  if (flash && performance.now() - flash.start >= FLASH_MS) flash = null;
}

/** Called before a row is moved out, so the rest glide into its place. */
export function animateNextReflow() {
  reflowNext = true;
}

/** Called after a create so the new row animates in on its own. */
export function highlightNew(id) {
  newestId = id;
}

/**
 * Called before a word changes pile on a tab where it stays in view, so the
 * row briefly takes the colour of where it went.
 */
export function flashRow(id) {
  flash = { id, start: null };
}

export function initList(onSelect) {
  listElement.addEventListener('click', (event) => {
    const row = event.target.closest('.word-row');
    if (row && row.dataset.id) onSelect(row.dataset.id);
  });
}
