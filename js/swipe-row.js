/**
 * swipe-row.js — drag a word leftwards to archive it.
 *
 * Leftwards only, deliberately: a rightward drag anywhere in a folder already
 * means "back to the grid" (js/nav-swipe.js), and the two would fight over the
 * same pixels. The direction is settled from the first few pixels and never
 * revisited, so the list can still be scrolled vertically without the rows
 * twitching sideways.
 */

/** Fraction of the row's width that counts as a commit. */
const ARCHIVE_RATIO = 0.38;
/** A flick this fast commits regardless of distance (px per ms). */
const ARCHIVE_VELOCITY = 0.65;
const START_SLOP = 8;

/** Must match the transitions in components.css. */
const SLIDE_MS = 180;
const COLLAPSE_MS = 200;

export function enableRowSwipe(listElement, canArchive, onArchive) {
  let tracking = false;
  let swiping = false;
  let item = null;
  let row = null;
  let width = 1;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;

  function clear() {
    tracking = false;
    swiping = false;
    if (item) {
      item.classList.remove('is-swiping', 'is-settling');
      item.style.removeProperty('--row-x');
      item.style.removeProperty('--row-progress');
    }
    item = null;
    row = null;
  }

  function onStart(event) {
    if (event.touches.length !== 1) return;
    if (!canArchive()) return;

    const target = event.target.closest('.word-row');
    if (!target || !listElement.contains(target)) return;

    row = target;
    item = target.closest('.word-item');
    if (!item) return;

    width = item.getBoundingClientRect().width || 1;
    tracking = true;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    lastX = startX;
    lastTime = event.timeStamp;
    velocity = 0;
  }

  function onMove(event) {
    if (!tracking) return;

    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!swiping) {
      if (Math.abs(dx) < START_SLOP && Math.abs(dy) < START_SLOP) return;
      // Vertical, or rightward: not ours. Scrolling and the back gesture win.
      if (Math.abs(dy) >= Math.abs(dx) || dx >= 0) {
        tracking = false;
        return;
      }
      swiping = true;
      item.classList.add('is-swiping');
    }

    const elapsed = Math.max(1, event.timeStamp - lastTime);
    velocity = (touch.clientX - lastX) / elapsed;
    lastX = touch.clientX;
    lastTime = event.timeStamp;

    event.preventDefault();

    const travelled = Math.min(0, dx);
    item.style.setProperty('--row-x', travelled + 'px');
    // The label behind fades up as the commit point approaches, so the
    // gesture tells you what it is going to do before it does it.
    const progress = Math.min(1, Math.abs(travelled) / (width * ARCHIVE_RATIO));
    item.style.setProperty('--row-progress', String(progress));
  }

  /** Slides the row out, collapses the gap, and only then changes the data. */
  function commit() {
    const target = item;
    const height = target.getBoundingClientRect().height;
    const id = row.dataset.id;

    target.classList.remove('is-swiping');
    target.classList.add('is-settling');
    target.style.setProperty('--row-x', -width + 'px');
    target.style.setProperty('--row-progress', '1');

    setTimeout(() => {
      target.style.height = height + 'px';
      target.classList.add('is-collapsing');
      // Next frame, so the starting height is committed before it changes.
      requestAnimationFrame(() => {
        target.style.height = '0px';
      });
    }, SLIDE_MS);

    // The store re-renders the list, which throws this node away — so the
    // whole animation has to be over before the data moves.
    setTimeout(() => onArchive(id), SLIDE_MS + COLLAPSE_MS);

    item = null;
    row = null;
    tracking = false;
    swiping = false;
  }

  function settleBack() {
    const target = item;
    target.classList.remove('is-swiping');
    target.classList.add('is-settling');
    target.style.setProperty('--row-x', '0px');
    target.style.setProperty('--row-progress', '0');
    setTimeout(() => {
      target.classList.remove('is-settling');
      target.style.removeProperty('--row-x');
      target.style.removeProperty('--row-progress');
    }, SLIDE_MS + 20);
    item = null;
    row = null;
    tracking = false;
    swiping = false;
  }

  function onEnd() {
    if (!swiping) {
      clear();
      return;
    }
    const travelled = startX - lastX;
    if (travelled > width * ARCHIVE_RATIO || -velocity > ARCHIVE_VELOCITY) commit();
    else settleBack();
  }

  listElement.addEventListener('touchstart', onStart, { passive: true });
  listElement.addEventListener('touchmove', onMove, { passive: false });
  listElement.addEventListener('touchend', onEnd);
  listElement.addEventListener('touchcancel', () => {
    if (swiping) settleBack();
    else clear();
  });
}
