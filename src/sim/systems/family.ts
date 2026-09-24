// Courtship, pregnancy, birth and growing up.
//
// An unrelated adult woman and man sharing Quarters court for a while (faster
// with more Charm); then she is pregnant for 3 hours, and the child grows up
// over another 3 hours. Births wait if there is no free bed.

import type { Content } from '../content';
import { population, storageCapacity } from '../economy';
import { roomDef } from '../grid';
import { bump, closelyRelated, createChild, effectiveStat, isAway, isChild } from '../residents';
import type { GameState, Resident } from '../types';

function eligible(state: GameState, r: Resident): boolean {
  return !r.dead && !r.waiting && !isChild(state, r);
}

export function courtshipSeconds(content: Content, a: Resident, b: Resident): number {
  const fam = content.balance.family;
  const charm = effectiveStat(content, a, 'charm') + effectiveStat(content, b, 'charm');
  return fam.courtshipBaseSeconds / (1 + charm / fam.courtshipCharmDivisor);
}

/** Pair people up in Quarters and advance courtships. Online only. */
export function tickCourtship(state: GameState, content: Content, dt: number): void {
  const busy = new Set<number>();
  for (const r of state.residents) {
    if (r.courtship) {
      busy.add(r.id);
      busy.add(r.courtship.partnerId);
    }
  }
  for (const room of state.rooms) {
    if (roomDef(content, room).category !== 'living') continue;
    const here = state.residents.filter((r) => r.roomId === room.id && eligible(state, r));
    const women = here.filter((r) => r.sex === 'f' && r.pregnancy === null && !busy.has(r.id));
    for (const woman of women) {
      const partner = here.find(
        (m) => m.sex === 'm' && !busy.has(m.id) && !closelyRelated(state, woman, m),
      );
      if (!partner) continue;
      woman.courtship = { partnerId: partner.id, progress: 0 };
      busy.add(woman.id);
      busy.add(partner.id);
      state.events.push({ type: 'courtshipStarted', motherId: woman.id, fatherId: partner.id });
    }
  }

  for (const woman of state.residents) {
    const c = woman.courtship;
    if (!c) continue;
    const partner = state.residents.find((r) => r.id === c.partnerId);
    // Courtship breaks off if either leaves the quarters (or the homestead).
    const room = woman.roomId !== null ? state.rooms.find((r) => r.id === woman.roomId) : undefined;
    const inQuarters = room !== undefined && roomDef(content, room).category === 'living';
    if (!partner || partner.dead || partner.roomId !== woman.roomId || woman.dead || !inQuarters || isAway(woman) || isAway(partner)) {
      woman.courtship = null;
      continue;
    }
    woman.happiness = 100;
    partner.happiness = 100;
    c.progress += dt;
    if (c.progress >= courtshipSeconds(content, woman, partner)) {
      woman.courtship = null;
      woman.pregnancy = { fatherId: partner.id, dueAt: state.time + content.balance.family.pregnancySeconds };
      bump(state, 'pregnancies');
      state.events.push({ type: 'pregnancy', motherId: woman.id, fatherId: partner.id });
    }
  }
}

/** Births and growing up. Runs online and offline (they're just timers). */
export function tickFamily(state: GameState, content: Content): void {
  for (const mother of [...state.residents]) {
    const p = mother.pregnancy;
    if (!p || state.time < p.dueAt || mother.dead) continue;
    if (population(state) >= storageCapacity(state, content, 'population')) continue; // wait for a bed
    // A father laid to rest still passes on his name in the family tree; the
    // mother stands in for his genes.
    const father = state.residents.find((r) => r.id === p.fatherId) ?? mother;
    const child = createChild(state, content, mother, father);
    child.fatherId = p.fatherId;
    state.residents.push(child);
    mother.pregnancy = null;
    bump(state, 'births');
    state.events.push({ type: 'birth', childId: child.id, motherId: mother.id });
  }
  for (const r of state.residents) {
    if (r.adultAt !== null && state.time >= r.adultAt) {
      r.adultAt = null;
      bump(state, 'grewUp');
      state.events.push({ type: 'grewUp', residentId: r.id });
    }
  }
}
