// Publishes the HUD's height as the CSS variable --hud-h, so panels and
// toasts on phones sit just below it however many rows it wraps to.

let last = -1;
let checked = 0;

/** Cheap to call every frame: it measures at most four times a second. */
export function syncHudHeight(hud: HTMLElement): void {
  const now = performance.now();
  if (now - checked < 250) return;
  checked = now;
  const h = Math.round(hud.getBoundingClientRect().bottom);
  if (h === last || h <= 0) return;
  last = h;
  document.documentElement.style.setProperty('--hud-h', `${h}px`);
}
