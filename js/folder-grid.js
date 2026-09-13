/**
 * folder-grid.js — the home screen.
 *
 * Columns of square tiles with every other one dropped half a tile, so the
 * rows interlock like brickwork. The offset is a padding on the column rather
 * than a transform on every other tile: a transform would leave the shorter
 * column hanging and open a gap at the bottom.
 *
 * Two columns on a phone and in the installed app; a wide browser window asks
 * for more through --folder-columns (see css/layout.css). The count lives in
 * the stylesheet so the breakpoints are defined in one place.
 */

import { getFolders, getWordsInFolder, countUnsorted } from './store.js';
import { UNSORTED } from './view.js';
import { UNSORTED_LABEL } from './config.js';
import { fitAll } from './fit-text.js';

const gridElement = document.getElementById('folder-grid');
const emptyElement = document.getElementById('folders-empty');

let onOpen = () => {};

function buildTile(label, count, target, photo) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'folder-tile';
  if (target === UNSORTED) button.classList.add('folder-tile--unsorted');

  if (photo) {
    button.classList.add('folder-tile--photo');

    const image = document.createElement('img');
    image.className = 'folder-tile__photo';
    image.src = photo;
    image.alt = '';
    image.decoding = 'async';
    button.appendChild(image);

    // Carries the photo down into the flat background the caption sits on.
    const veil = document.createElement('span');
    veil.className = 'folder-tile__veil';
    button.appendChild(veil);
  }

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

function columnCount() {
  const value = parseInt(getComputedStyle(gridElement).getPropertyValue('--folder-columns'), 10);
  return value > 0 ? value : 2;
}

export function renderFolders() {
  const folders = getFolders();

  const tiles = folders.map((folder) =>
    buildTile(folder.name, getWordsInFolder(folder.name).length, folder.name, folder.photo));

  // Only worth a tile when something actually landed there.
  const stray = countUnsorted();
  if (stray > 0) tiles.push(buildTile(UNSORTED_LABEL, stray, UNSORTED));

  const count = columnCount();
  const columns = Array.from({ length: count }, () => {
    const column = document.createElement('div');
    column.className = 'folders__column';
    return column;
  });

  // Dealt across in reading order, left to right and then down.
  tiles.forEach((tile, index) => columns[index % count].appendChild(tile));

  gridElement.replaceChildren(...columns);
  emptyElement.hidden = tiles.length !== 0;

  // Measured only once the tiles are in the document and have a width.
  fitAll(gridElement, '.folder-tile__name', 12);
}

export function initFolderGrid(handler) {
  onOpen = handler;
}
