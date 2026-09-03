/**
 * reel.js — one word per screen, in random order.
 *
 * A different way to revise the same folder: instead of scanning a list you
 * meet the entries one at a time, shuffled, so the order of the list stops
 * being a memory aid.
 */

import { visibleWords } from './list.js';
import { DEFAULT_COLOR } from './config.js';

const reelElement = document.getElementById('reel');

let order = [];

function shuffled(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Deals a fresh order. Called when the reel is opened, not on every render. */
export function shuffleReel() {
  order = shuffled(visibleWords().map((word) => word.id));
}

function block(label, text) {
  const section = document.createElement('section');
  section.className = 'detail__block';

  const heading = document.createElement('h3');
  heading.className = 'detail__label';
  heading.textContent = label;

  const body = document.createElement('p');
  body.className = 'detail__text';
  body.textContent = text;

  section.appendChild(heading);
  section.appendChild(body);
  return section;
}

function buildCard(word) {
  const card = document.createElement('article');
  card.className = 'reel-card';

  const inner = document.createElement('div');
  inner.className = 'reel-card__inner';

  if (word.pos) {
    const pos = document.createElement('p');
    pos.className = 'detail__pos';
    pos.textContent = word.pos;
    inner.appendChild(pos);
  }

  const heading = document.createElement('h2');
  heading.className = 'reel-card__word';
  heading.dataset.color = word.color || DEFAULT_COLOR;
  heading.textContent = word.word;
  inner.appendChild(heading);

  if (word.definition) inner.appendChild(block('Definition', word.definition));
  if (word.note) inner.appendChild(block('Note', word.note));

  card.appendChild(inner);
  return card;
}

export function renderReel() {
  const words = visibleWords();
  const byId = new Map(words.map((word) => [word.id, word]));

  // Keep the dealt order, but drop anything deleted and append anything new
  // rather than reshuffling under the reader's thumb.
  const kept = order.filter((id) => byId.has(id));
  const fresh = words.filter((word) => !kept.includes(word.id)).map((word) => word.id);
  order = kept.concat(fresh);

  const fragment = document.createDocumentFragment();
  order.forEach((id) => fragment.appendChild(buildCard(byId.get(id))));
  reelElement.replaceChildren(fragment);
}
