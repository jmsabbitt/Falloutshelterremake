// Design changes from the playtest's open questions, each one a separate commit
// so it can be kept or dropped on its own.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/sim';

const content = loadContent();

describe('ending achievements', () => {
  it('are hidden until earned, so Goals does not spoil how the story ends', () => {
    for (const id of ['ending_renewal', 'ending_eviction', 'ending_holdover', 'ending_neighbours']) {
      expect(content.achievements.find((a) => a.id === id)?.hidden, id).toBe(true);
    }
    // "Reach an ending" names no ending, so it stays visible as a goal.
    expect(content.achievements.find((a) => a.id === 'ending_any')?.hidden).toBeFalsy();
  });
});
