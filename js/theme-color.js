/**
 * theme-color.js — keeps the browser's own chrome in step with the page.
 *
 * In standalone mode iOS paints the area behind the status bar from the
 * theme-color meta tag. Left alone it re-evaluates on its own schedule, so the
 * strip above the app changes a beat after a sheet has already darkened the
 * screen — the mismatch reads as a glitch.
 *
 * Driving the tag directly, and easing it over the same span as the backdrop,
 * makes the whole top of the screen move as one.
 */

/** Matched to the sheet's own entrance and exit in animations.css. */
const ENTER_MS = 320;
const EXIT_MS = 240;

const meta = document.getElementById('theme-color');
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

let depth = 0;
let frame = null;
let currentRgb = null;

function parseColor(value) {
  const text = String(value || '').trim();

  const rgb = text.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
  }

  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) digits = digits.split('').map((d) => d + d).join('');
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }

  return null;
}

function pageColor() {
  return parseColor(getComputedStyle(document.body).backgroundColor)
    || { r: 255, g: 255, b: 255, a: 1 };
}

function scrimColor() {
  return parseColor(getComputedStyle(document.documentElement).getPropertyValue('--scrim'))
    || { r: 0, g: 0, b: 0, a: 0.4 };
}

/** The page colour with the scrim laid over it, which is what a viewer sees. */
function dimmedColor() {
  const base = pageColor();
  const scrim = scrimColor();
  const mix = (channel, over) => Math.round(channel * (1 - scrim.a) + over * scrim.a);
  return { r: mix(base.r, scrim.r), g: mix(base.g, scrim.g), b: mix(base.b, scrim.b), a: 1 };
}

function toHex(color) {
  const pair = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return '#' + pair(color.r) + pair(color.g) + pair(color.b);
}

function apply(color) {
  currentRgb = color;
  if (meta) meta.setAttribute('content', toHex(color));
}

/** Matches the ease-out feel of the backdrop it is following. */
function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

function animateTo(target, duration) {
  if (frame) cancelAnimationFrame(frame);

  const from = currentRgb || pageColor();
  const start = performance.now();

  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const k = easeOut(t);
    apply({
      r: from.r + (target.r - from.r) * k,
      g: from.g + (target.g - from.g) * k,
      b: from.b + (target.b - from.b) * k,
      a: 1,
    });
    frame = t < 1 ? requestAnimationFrame(step) : null;
  };

  frame = requestAnimationFrame(step);
}

/** Called when a dialog opens. Reference counted for stacked sheets. */
export function dim() {
  depth += 1;
  if (depth > 1) return;
  animateTo(dimmedColor(), ENTER_MS);
}

export function undim() {
  if (depth === 0) return;
  depth -= 1;
  if (depth > 0) return;
  animateTo(pageColor(), EXIT_MS);
}

export function initThemeColor() {
  if (!meta) return;

  apply(depth > 0 ? dimmedColor() : pageColor());

  // Follow the device switching between light and dark.
  const onSchemeChange = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    apply(depth > 0 ? dimmedColor() : pageColor());
  };

  if (darkQuery.addEventListener) darkQuery.addEventListener('change', onSchemeChange);
  else if (darkQuery.addListener) darkQuery.addListener(onSchemeChange);
}
