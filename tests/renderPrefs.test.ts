import { describe, expect, it } from 'vitest';
import { frameCap } from '../src/client/render/governor';
import { parsePrefs } from '../src/client/render/prefs';

describe('render prefs', () => {
  it('reads missing or malformed settings as off', () => {
    for (const j of [null, '', '{', '[]', '42', '{"batterySaver":"yes"}']) expect(parsePrefs(j)).toEqual({ batterySaver: false, reducedMotion: false });
  });
  it('reads the two flags', () => {
    expect(parsePrefs('{"batterySaver":true,"reducedMotion":true,"haptics":false}')).toEqual({ batterySaver: true, reducedMotion: true });
  });
});

describe('frame governor', () => {
  it('runs uncapped when active, 30 when idle, and lower in battery saver', () => {
    expect(frameCap(false, false)).toBe(0);
    expect(frameCap(false, true)).toBe(30);
    expect(frameCap(true, false)).toBe(30);
    expect(frameCap(true, true)).toBe(10);
  });
});
