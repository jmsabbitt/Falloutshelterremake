// Every weapon says how it is held, which picks the resident's fight sheet
// (fight_<grip>) in the vault and quest views.

import { describe, expect, it } from 'vitest';
import { WEAPON_GRIPS, loadContent } from '../src/sim';
import items from '../src/content/items.json';
import legends from '../src/content/legends.json';

describe('weapon grips', () => {
  it('every weapon in items.json has a valid grip', () => {
    for (const w of items.weapons as { id: string; grip?: string }[]) {
      expect(WEAPON_GRIPS, `${w.id} grip`).toContain(w.grip);
    }
  });

  it('every loaded weapon (loot-only ones included) has a valid grip, and legends carry weapons that have one', () => {
    const content = loadContent();
    const weapons = Object.values(content.weapons);
    expect(weapons.length).toBe(items.weapons.length);
    for (const w of weapons) expect(WEAPON_GRIPS, `${w.id} grip`).toContain(w.grip);
    for (const legend of legends.legends as { id: string; weapon?: string | null }[]) {
      if (legend.weapon) expect(WEAPON_GRIPS, `${legend.id} weapon`).toContain(content.weapons[legend.weapon]?.grip);
    }
  });

  it('holds the obvious ones the obvious way', () => {
    const { weapons } = loadContent();
    expect(weapons.rusty_revolver?.grip).toBe('pistol');
    expect(weapons.longrifle?.grip).toBe('longgun');
    expect(weapons.thunderclap?.grip).toBe('heavy');
    expect(weapons.wrench?.grip).toBe('melee');
  });
});
