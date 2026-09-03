/**
 * fit-text.js — shrink type until it fits on one line.
 *
 * Folder names are user-supplied and can be any length, but a name that wraps
 * or clips reads as broken. Rather than truncating, the size comes down.
 *
 * Measured proportionally instead of stepping down a pixel at a time: one
 * measurement gives the ratio, and a couple of correction passes settle the
 * rest. A loop of single-pixel decrements would force a reflow per step, and
 * with sixteen tiles on screen that adds up.
 */

const DEFAULT_MIN = 11;
const PASSES = 3;

export function fitOneLine(element, minPx) {
  if (!element) return;

  const floor = minPx || DEFAULT_MIN;

  // Back to the stylesheet's size, so repeated calls do not ratchet downwards.
  element.style.removeProperty('font-size');

  const available = element.clientWidth;
  if (!available) return;

  let size = parseFloat(getComputedStyle(element).fontSize);
  if (!size) return;

  for (let pass = 0; pass < PASSES; pass++) {
    const needed = element.scrollWidth;
    if (needed <= available + 0.5) break;

    const next = Math.max(floor, size * (available / needed));
    if (next >= size - 0.05) break;
    size = next;
    element.style.setProperty('font-size', size.toFixed(2) + 'px');
  }
}

/** Re-fits everything matching `selector` inside `root`. */
export function fitAll(root, selector, minPx) {
  (root || document).querySelectorAll(selector).forEach((element) => {
    fitOneLine(element, minPx);
  });
}
