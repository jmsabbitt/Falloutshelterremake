// M8: phones show panels as bottom sheets with a grab handle. Pulling the
// handle (or the header) down drags the sheet with the finger; let go far
// enough, or with a flick, and it closes. Anything short of that springs back.

import { isPhone } from './layout';

/** Pulled at least this far (px), or flicked faster than FLICK px/ms, closes the sheet. */
const CLOSE_DY = 90;
const FLICK = 0.6;
/** Movement below this is still a tap on whatever is under the finger. */
const SLOP = 8;

export function installSheetSwipe(host: HTMLElement, close: () => void): void {
  let drag: { id: number; y0: number; t0: number; dy: number; live: boolean } | null = null;

  host.addEventListener('pointerdown', (e) => {
    if (!isPhone() || drag) return;
    const target = e.target as HTMLElement;
    const sheet = host.firstElementChild as HTMLElement | null;
    if (!sheet || !sheet.classList.contains('panel') || sheet.classList.contains('sheet-bar')) return;
    // Only the handle and the header's empty space: buttons in the header keep their taps.
    if (!target.closest('.grab, .panel > header') || target.closest('button, input, select')) return;
    drag = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0, live: false };
  });

  host.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    if (!drag.live && Math.abs(dy) > SLOP) {
      drag.live = true;
      host.classList.add('dragging');
      host.setPointerCapture?.(e.pointerId);
    }
    if (!drag.live) return;
    drag.dy = Math.max(0, dy);
    host.style.transform = `translateY(${drag.dy}px)`;
  });

  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.live) return;
    host.classList.remove('dragging');
    host.style.transform = '';
    const speed = d.dy / Math.max(1, performance.now() - d.t0);
    if (d.dy > CLOSE_DY || (d.dy > 24 && speed > FLICK)) close();
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
}
