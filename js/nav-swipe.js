/**
 * nav-swipe.js — swipe right to leave a folder.
 *
 * The folder header carries the name and two controls and no back arrow, so
 * this gesture is the primary way out. It has to coexist with the list's
 * vertical scrolling and the reel's vertical snapping, which is why the
 * direction is decided from the first few pixels and never revisited.
 *
 * The gesture is listened for on the scroller but drawn on a surface that
 * covers the header as well, so the whole screen travels as one piece.
 */

const DISMISS_RATIO = 0.28;
const DISMISS_VELOCITY = 0.5;
const START_SLOP = 8;

export function enableBackSwipe(element, surface, canGoBack, onBack) {
  let tracking = false;
  let sliding = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;

  function clear() {
    tracking = false;
    sliding = false;
    surface.classList.remove('is-sliding');
    surface.style.removeProperty('--nav-x');
  }

  function settle(target, done) {
    surface.classList.add('is-settling');
    surface.style.setProperty('--nav-x', target + 'px');

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      surface.classList.remove('is-settling');
      done();
    };

    // The transition runs on the header and the scroller; the event bubbles
    // up to the surface that carries the class.
    surface.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 420);
  }

  element.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || !canGoBack()) return;
    const touch = event.touches[0];
    tracking = true;
    startX = touch.clientX;
    startY = touch.clientY;
    lastX = touch.clientX;
    lastTime = event.timeStamp;
    velocity = 0;
  }, { passive: true });

  element.addEventListener('touchmove', (event) => {
    if (!tracking) return;

    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!sliding) {
      if (Math.abs(dx) < START_SLOP && Math.abs(dy) < START_SLOP) return;
      // Vertical, or leftward: the content keeps it.
      if (Math.abs(dy) >= Math.abs(dx) || dx <= 0) {
        tracking = false;
        return;
      }
      sliding = true;
      surface.classList.add('is-sliding');
    }

    const elapsed = Math.max(1, event.timeStamp - lastTime);
    velocity = (touch.clientX - lastX) / elapsed;
    lastX = touch.clientX;
    lastTime = event.timeStamp;

    event.preventDefault();
    surface.style.setProperty('--nav-x', Math.max(0, dx) + 'px');
  }, { passive: false });

  const release = () => {
    if (!sliding) {
      tracking = false;
      return;
    }

    const travelled = lastX - startX;
    const width = element.getBoundingClientRect().width || 1;
    const leave = travelled > width * DISMISS_RATIO || velocity > DISMISS_VELOCITY;

    tracking = false;
    sliding = false;

    if (leave) {
      settle(width, () => {
        onBack();
        clear();
      });
    } else {
      settle(0, clear);
    }
  };

  element.addEventListener('touchend', release);
  element.addEventListener('touchcancel', () => {
    if (sliding) settle(0, clear);
    else clear();
  });
}
