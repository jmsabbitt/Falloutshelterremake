// The HALCY coach bubble belongs to the homestead it was shown for. Switching to
// another game (a Custom Game, a loaded save, a new founding) with no tutorial
// running must hide it: it used to stay up, welcoming the Warden to the old homestead.

import { describe, expect, it, vi } from 'vitest';
import { loadContent, newCustomGame, newGame } from '../src/sim';

type FakeEl = { hidden: boolean; children: unknown[]; replaceChildren: (...c: unknown[]) => void; getBoundingClientRect: () => { height: number; bottom: number } };
const fakeEl = (attrs: Record<string, unknown> = {}, ...children: unknown[]): FakeEl => {
  const el: FakeEl = {
    hidden: attrs.hidden === true,
    children,
    replaceChildren(...c: unknown[]) {
      el.children = c;
    },
    getBoundingClientRect: () => ({ height: 0, bottom: 0 }),
  };
  return el;
};
vi.mock('../src/client/ui/dom', () => ({ h: (_tag: string, attrs?: Record<string, unknown>, ...c: unknown[]) => fakeEl(attrs, ...c) }));
vi.mock('../src/client/ui/halcy', () => ({ halcyFace: () => fakeEl() }));
vi.mock('../src/client/ui/layout', () => ({ isPhone: () => false }));
vi.mock('../src/client/ui/confirm', () => ({ ask: () => {} }));

describe('the tutorial coach', () => {
  it('hides when the homestead is replaced by one without a tutorial', async () => {
    const g = globalThis as Record<string, unknown>;
    g.document = { getElementById: () => null };
    const { TutorialCoach } = await import('../src/client/ui/tutorial');
    const content = loadContent();
    const game = { state: newGame(content, { seed: 1, now: 0, tutorial: true }), content };
    const coach = new TutorialCoach({
      game,
      view: { coachRoomIds: [], buildMode: null },
      panel: () => null,
      reveal: () => {},
      endBuild: () => {},
      openBuild: () => {},
      toast: () => {},
    } as never);
    coach.update();
    expect(coach.visible()).toBe(true);
    const custom = newCustomGame(content, 'boomtown', { seed: 2, now: 0 });
    if (!custom.ok) throw new Error(custom.reason);
    game.state = custom.state;
    coach.onStateReplaced();
    coach.update();
    expect(coach.visible()).toBe(false);
    delete g.document;
  });
});
