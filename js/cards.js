/**
 * cards.js — one flash card per screen, in random order.
 *
 * The front carries the word and nothing else; a tap turns the card over to
 * everything else, and another tap turns it back. YouGlish is on both faces,
 * so hearing the word never means giving the answer away.
 *
 * The turn is a pure CSS transform between two faces that already exist, so
 * nothing is built, measured or swapped at the moment of the tap. The tap
 * toggles one class, and the compositor does the rest — which is what keeps
 * it smooth in the installed app, where the main thread is the first thing
 * iOS starves.
 */

import { visibleWords, paintEmpty } from './list.js';
import { getFilter } from './view.js';
import { DEFAULT_COLOR, YOUGLISH_BASE, YOUGLISH_LANGUAGE } from './config.js';

const cardsElement = document.getElementById('cards');

/** Must match the .flashcard transition in components.css. */
const FLIP_MS = 520;

let order = [];
let lastSignature = '';

/** Cards currently showing their back, so a re-render keeps them that way. */
const flipped = new Set();

function shuffled(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Deals a fresh order, every card face up. Called when the mode is opened. */
export function shuffleCards() {
  order = shuffled(visibleWords().map((word) => word.id));
  flipped.clear();
  lastSignature = '';
}

function youglish(word) {
  const link = document.createElement('a');
  link.className = 'youglish flashcard__youglish';
  link.href = YOUGLISH_BASE + encodeURIComponent(word.word) + '/' + YOUGLISH_LANGUAGE;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', 'Hear “' + word.word + '” on YouGlish');

  const label = document.createElement('span');
  label.textContent = 'youglish';
  link.appendChild(label);

  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('class', 'youglish__chevron');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9 6l6 6-6 6');
  chevron.appendChild(path);
  link.appendChild(chevron);

  return link;
}

function block(label, text) {
  const section = document.createElement('section');
  section.className = 'detail__block';

  const heading = document.createElement('h4');
  heading.className = 'detail__label';
  heading.textContent = label;

  const body = document.createElement('p');
  body.className = 'detail__text';
  body.textContent = text;

  section.appendChild(heading);
  section.appendChild(body);
  return section;
}

function mark() {
  const element = document.createElement('span');
  element.className = 'flashcard__mark';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function buildCard(word) {
  const slot = document.createElement('article');
  slot.className = 'card-slot';

  const card = document.createElement('div');
  card.className = 'flashcard';
  card.dataset.id = word.id;
  card.dataset.status = word.status || '';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  // Front: the word, alone.
  const front = document.createElement('div');
  front.className = 'flashcard__face flashcard__face--front';
  front.appendChild(mark());

  const heading = document.createElement('h2');
  heading.className = 'flashcard__word';
  heading.dataset.color = word.color || DEFAULT_COLOR;
  heading.textContent = word.word;
  front.appendChild(heading);
  front.appendChild(youglish(word));

  // Back: everything else, laid out like the detail card.
  const back = document.createElement('div');
  back.className = 'flashcard__face flashcard__face--back';
  back.appendChild(mark());

  const body = document.createElement('div');
  body.className = 'flashcard__body';

  if (word.pos) {
    const pos = document.createElement('p');
    pos.className = 'detail__pos';
    pos.textContent = word.pos;
    body.appendChild(pos);
  }

  const title = document.createElement('h3');
  title.className = 'flashcard__title';
  title.dataset.color = word.color || DEFAULT_COLOR;
  title.textContent = word.word;
  body.appendChild(title);

  if (word.definition) body.appendChild(block('Definition', word.definition));
  if (word.note) body.appendChild(block('Note', word.note));
  if (!word.definition && !word.note) {
    const nothing = document.createElement('p');
    nothing.className = 'flashcard__empty';
    nothing.textContent = 'No definition yet.';
    body.appendChild(nothing);
  }

  back.appendChild(body);
  back.appendChild(youglish(word));

  card.appendChild(front);
  card.appendChild(back);
  paintSide(card, flipped.has(word.id));

  slot.appendChild(card);
  return slot;
}

/** Keeps the class, the pressed state and what a screen reader sees in step. */
function paintSide(card, showBack) {
  card.classList.toggle('is-flipped', showBack);
  card.setAttribute('aria-pressed', showBack ? 'true' : 'false');
  card.setAttribute('aria-label', showBack ? 'Showing details. Tap to show the word.' : 'Tap to show details.');
  const [front, back] = card.querySelectorAll('.flashcard__face');
  front.setAttribute('aria-hidden', showBack ? 'true' : 'false');
  back.setAttribute('aria-hidden', showBack ? 'false' : 'true');
  // Links on the hidden face must not be reachable by Tab either.
  front.querySelector('a').tabIndex = showBack ? -1 : 0;
  back.querySelector('a').tabIndex = showBack ? 0 : -1;
}

function flip(card) {
  const id = card.dataset.id;
  const showBack = !flipped.has(id);
  if (showBack) flipped.add(id);
  else flipped.delete(id);

  // Promoted just for the turn; see prime(). Dropped afterwards so a long
  // deck does not keep a compositor layer per card.
  card.classList.add('is-primed');
  paintSide(card, showBack);
  clearTimeout(card.primeTimer);
  card.primeTimer = setTimeout(() => card.classList.remove('is-primed'), FLIP_MS + 80);
}

/**
 * Promotes the card to its own layer as the finger lands, which is ~100ms
 * before the click that turns it. By the time the transition starts the layer
 * already exists, so the first frame is not spent creating it.
 */
function prime(event) {
  const card = event.target.closest('.flashcard');
  if (!card || event.target.closest('a')) return;
  card.classList.add('is-primed');
  clearTimeout(card.primeTimer);
  card.primeTimer = setTimeout(() => card.classList.remove('is-primed'), 1500);
}

function signatureOf(words) {
  return getFilter() + '\n' + words
    .map((word) => [
      word.id, word.word, word.pos, word.definition, word.note, word.color, word.status || '',
    ].join('\t'))
    .join('\n');
}

export function renderCards() {
  const words = visibleWords();
  const byId = new Map(words.map((word) => [word.id, word]));
  cardsElement.dataset.filter = getFilter();

  // Keep the dealt order, but drop anything that left and append anything
  // new rather than reshuffling under the reader's thumb.
  const kept = order.filter((id) => byId.has(id));
  const fresh = words.filter((word) => !kept.includes(word.id)).map((word) => word.id);
  order = kept.concat(fresh);

  const ordered = order.map((id) => byId.get(id));
  paintEmpty(ordered.length);

  // A sync that changed nothing on screen must not rebuild the deck: it would
  // cancel a turn in progress and throw away the scroll position.
  const signature = signatureOf(ordered);
  if (signature === lastSignature && cardsElement.childElementCount) return;
  lastSignature = signature;

  const fragment = document.createDocumentFragment();
  ordered.forEach((word) => fragment.appendChild(buildCard(word)));
  cardsElement.replaceChildren(fragment);
}

export function initCards() {
  cardsElement.addEventListener('touchstart', prime, { passive: true });

  cardsElement.addEventListener('click', (event) => {
    // The YouGlish link opens; it does not turn the card.
    if (event.target.closest('a')) return;
    const card = event.target.closest('.flashcard');
    if (card) flip(card);
  });

  cardsElement.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.flashcard');
    if (!card || event.target !== card) return;
    event.preventDefault();
    flip(card);
  });
}
