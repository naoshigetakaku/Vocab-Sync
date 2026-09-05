/**
 * swipe-row.js — drag a word leftwards to file it somewhere else.
 *
 * Leftwards only, deliberately: a rightward drag anywhere in a folder already
 * means "back to the grid" (js/nav-swipe.js), and the two would fight over the
 * same pixels. The direction is settled from the first few pixels and never
 * revisited, so the list can still be scrolled vertically without the rows
 * twitching sideways.
 *
 * The sequence after the threshold is: park the row, ask (if the caller wants
 * a confirmation), then either play the exit and commit, or spring back.
 *
 * Nothing here holds on to a DOM node across an await. The list re-renders on
 * every store change — a background sync is enough — so a node captured before
 * the confirmation is very often not the node on screen after it. Each step
 * looks the row up again by word id, and simply does nothing if it has gone.
 */

/** Fraction of the row's width that counts as a commit. */
const COMMIT_RATIO = 0.38;
/** A flick this fast commits regardless of distance (px per ms). */
const COMMIT_VELOCITY = 0.65;
const START_SLOP = 8;

/** How far the row sits open while a confirmation is up. */
const PARK_RATIO = 0.34;

/** Must match the transitions in layout.css. */
const SLIDE_MS = 190;
const COLLAPSE_MS = 200;
const SPRING_MS = 190;

export function enableRowSwipe(listElement, handlers) {
  const canSwipe = handlers.canSwipe || (() => true);
  const confirm = handlers.confirm || (() => Promise.resolve(true));
  const perform = handlers.perform;

  let tracking = false;
  let swiping = false;
  let busy = false;
  let activeId = null;
  let width = 1;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;

  /** The row on screen for this word right now, or null if it has gone. */
  function itemFor(id) {
    if (!id) return null;
    const row = listElement.querySelector('.word-row[data-id="' + CSS.escape(id) + '"]');
    return row ? row.closest('.word-item') : null;
  }

  function strip(item) {
    if (!item) return;

    item.classList.remove('is-swiping', 'is-parked', 'is-exiting', 'is-collapsing');
    item.style.removeProperty('--row-x');
    item.style.removeProperty('--row-progress');
    item.style.removeProperty('height');

    // Land at rest in this frame. The row carries a transform transition of
    // its own for press feedback, and leaving that to unwind the offset
    // strands the row part-way across whenever the frame budget slips —
    // which is precisely the jitter this gesture used to show.
    const row = item.querySelector('.word-row');
    if (!row) return;
    item.classList.add('is-reset');
    void row.offsetWidth;
    item.classList.remove('is-reset');
  }

  function resetGesture() {
    tracking = false;
    swiping = false;
  }

  function onStart(event) {
    if (busy) return;
    if (event.touches.length !== 1) return;
    if (!canSwipe()) return;

    const row = event.target.closest('.word-row');
    if (!row || !listElement.contains(row)) return;

    const item = row.closest('.word-item');
    if (!item) return;

    activeId = row.dataset.id;
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

    const item = itemFor(activeId);
    if (!item) {
      resetGesture();
      return;
    }

    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!swiping) {
      if (Math.abs(dx) < START_SLOP && Math.abs(dy) < START_SLOP) return;
      // Vertical, or rightward: not ours. Scrolling and the back gesture win.
      if (Math.abs(dy) >= Math.abs(dx) || dx >= 0) {
        resetGesture();
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
    // gesture says what it is going to do before it does it.
    item.style.setProperty(
      '--row-progress',
      String(Math.min(1, Math.abs(travelled) / (width * COMMIT_RATIO)))
    );
  }

  /**
   * Resolves when the transition really ends, or when the fallback fires —
   * whichever comes first.
   *
   * Timers alone were the source of the jitter: a throttled or busy frame
   * stretches them, and the next step then starts on top of a transition that
   * has not finished. The event is the truth; the timer only guarantees the
   * sequence can never stall.
   */
  function afterTransition(element, property, fallbackMs) {
    return new Promise((resolve) => {
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        element.removeEventListener('transitionend', onEnd);
        resolve();
      };

      const onEnd = (event) => {
        if (event.target === element && event.propertyName === property) finish();
      };

      element.addEventListener('transitionend', onEnd);
      setTimeout(finish, fallbackMs);
    });
  }

  /** Holds the row open at a fixed offset while the question is on screen. */
  function park(id) {
    const item = itemFor(id);
    if (!item) return;
    item.classList.remove('is-swiping');
    item.classList.add('is-parked');
    item.style.setProperty('--row-x', -Math.round(width * PARK_RATIO) + 'px');
    item.style.setProperty('--row-progress', '1');
  }

  async function springBack(id) {
    const item = itemFor(id);
    if (!item) return;

    const row = item.querySelector('.word-row');
    item.classList.remove('is-swiping', 'is-parked');
    item.classList.add('is-exiting');
    item.style.setProperty('--row-x', '0px');
    item.style.setProperty('--row-progress', '0');

    await afterTransition(row, 'transform', SPRING_MS + 150);
    strip(itemFor(id));
  }

  /** Slides the row the rest of the way out, then closes the gap it leaves. */
  async function playExit(id) {
    const item = itemFor(id);
    if (!item) return;

    const box = item.getBoundingClientRect();
    const row = item.querySelector('.word-row');

    item.classList.remove('is-swiping', 'is-parked');
    item.classList.add('is-exiting');
    item.style.setProperty('--row-x', -Math.ceil(box.width) + 'px');
    item.style.setProperty('--row-progress', '1');

    await afterTransition(row, 'transform', SLIDE_MS + 150);

    const still = itemFor(id);
    if (!still) return;

    still.style.height = Math.round(box.height) + 'px';
    // Force the starting height to be committed before it changes, so the
    // transition has two values to move between. A rAF is not enough: the
    // class and the height would land in the same style recalculation.
    void still.offsetHeight;
    still.classList.add('is-collapsing');
    still.style.height = '0px';

    await afterTransition(still, 'height', COLLAPSE_MS + 150);
  }

  async function run(id) {
    busy = true;
    try {
      park(id);
      const proceed = await confirm(id);
      if (!proceed) {
        await springBack(id);
        return;
      }
      await playExit(id);
      // The list re-renders here, which is exactly why the node was never
      // held on to.
      await perform(id);
    } finally {
      strip(itemFor(id));
      busy = false;
      activeId = null;
    }
  }

  function onEnd() {
    if (!swiping) {
      const item = itemFor(activeId);
      if (item && !busy) strip(item);
      resetGesture();
      return;
    }

    const travelled = startX - lastX;
    const id = activeId;
    resetGesture();

    if (travelled > width * COMMIT_RATIO || -velocity > COMMIT_VELOCITY) run(id);
    else springBack(id).then(() => { activeId = null; });
  }

  listElement.addEventListener('touchstart', onStart, { passive: true });
  listElement.addEventListener('touchmove', onMove, { passive: false });
  listElement.addEventListener('touchend', onEnd);
  listElement.addEventListener('touchcancel', () => {
    if (busy) return;
    const id = activeId;
    resetGesture();
    if (id) springBack(id).then(() => { activeId = null; });
  });
}
