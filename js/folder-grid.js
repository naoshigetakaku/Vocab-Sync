/**
 * folder-grid.js — the home screen.
 *
 * Two columns of square tiles with the right-hand one dropped half a tile, so
 * the rows interlock like brickwork. The offset is a padding on the column
 * rather than a transform on every other tile: a transform would leave the
 * shorter column hanging and open a gap at the bottom.
 */

import { getFolders, getWordsInFolder, countUnsorted } from './store.js';
import { UNSORTED } from './view.js';
import { UNSORTED_LABEL } from './config.js';

const gridElement = document.getElementById('folder-grid');
const emptyElement = document.getElementById('folders-empty');

let onOpen = () => {};

function buildTile(label, count, target) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'folder-tile';
  if (target === UNSORTED) button.classList.add('folder-tile--unsorted');

  const name = document.createElement('span');
  name.className = 'folder-tile__name';
  name.textContent = label;

  const tally = document.createElement('span');
  tally.className = 'folder-tile__count';
  tally.textContent = count === 1 ? '1 word' : count + ' words';

  button.appendChild(name);
  button.appendChild(tally);

  button.addEventListener('click', () => onOpen(target));
  return button;
}

export function renderFolders() {
  const folders = getFolders();

  const tiles = folders.map((folder) =>
    buildTile(folder.name, getWordsInFolder(folder.name).length, folder.name));

  // Only worth a tile when something actually landed there.
  const stray = countUnsorted();
  if (stray > 0) tiles.push(buildTile(UNSORTED_LABEL, stray, UNSORTED));

  const left = document.createElement('div');
  left.className = 'folders__column';
  const right = document.createElement('div');
  right.className = 'folders__column';

  tiles.forEach((tile, index) => (index % 2 === 0 ? left : right).appendChild(tile));

  gridElement.replaceChildren(left, right);
  emptyElement.hidden = tiles.length !== 0;
}

export function initFolderGrid(handler) {
  onOpen = handler;
}
