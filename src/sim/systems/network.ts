// Act 4: the homestead network in the field. A quest flagged `network` gets
// help from home when the party sets out: every outpost (an earlier
// homestead, still running) relays for the party, sending Med-Patches and a
// little extra punch, and every faction at Friendly or better sends help that
// acts on its own timer during fights. The help is fixed at departure, so a
// party doesn't change mid-quest when reputation moves. Nothing here runs
// offline: it lives inside quest combat, which never does.
//
// Faction help, each in character:
//   caravaners   Long Road resupply: patches up the whole party
//   tinkers      Scrapwright turret: hits every enemy
//   rustmen      clan charge: a heavy hit on the biggest enemy
//   lamplighters lamp flare: stuns an enemy, cancelling a wind-up if one is coming
//   homestead9   Tier Zero drill: the party takes less damage for a while

import type { Content } from '../content';
import { bump, bumpMax } from '../residents';
import type { GameState, Quest, QuestEnemy, QuestSupport } from '../types';
import { factionDef, factionTier, isMet } from './factions';

export interface NetworkTuning {
  /** Outposts that count toward the relay. */
  maxRelay: number;
  /** Party damage per relaying outpost. */
  relayDamage: number;
  /** Free Med-Patches per relaying outpost (on top of the ones packed). */
  relayMedpatch: number;
  /** Faction tier index needed to send help (3 = Friendly). */
  minTier: number;
  /** Seconds between each ally's actions, and a stagger so they don't all land at once. */
  allyEvery: number;
  allyStagger: number;
  /** An ally's hit: (base + perLevel × quest level) × power. */
  allyBase: number;
  allyPerLevel: number;
  turretPower: number;
  chargePower: number;
  /** Share of max HP the caravan resupply heals. */
  resupplyHeal: number;
  flareStun: number;
  shieldSeconds: number;
  /** Share of damage the Tier Zero drill takes off. */
  shieldReduction: number;
}

/** Order in which allies are listed (and act first). */
export const ALLY_ORDER = ['caravaners', 'tinkers', 'rustmen', 'lamplighters', 'homestead9'];

const DEFAULTS: NetworkTuning = {
  maxRelay: 5,
  relayDamage: 0.03,
  relayMedpatch: 1,
  minTier: 3,
  allyEvery: 18,
  allyStagger: 4,
  allyBase: 6,
  allyPerLevel: 0.3,
  turretPower: 0.7,
  chargePower: 2.2,
  resupplyHeal: 0.1,
  flareStun: 2.5,
  shieldSeconds: 6,
  shieldReduction: 0.3,
};

export function networkTuning(content: Content): NetworkTuning {
  const t = (content.quests as unknown as { tuning: { network?: Partial<NetworkTuning> } }).tuning.network;
  return { ...DEFAULTS, ...(t ?? {}) };
}

/** Factions who would send help right now (met, and at the tuning's tier or better). */
export function networkAllies(state: GameState, content: Content): string[] {
  const t = networkTuning(content);
  return ALLY_ORDER.filter((id) => factionDef(content, id) && isMet(state, id) && factionTier(state, content, id) >= t.minTier);
}

/** What a network quest would get if it set out now. */
export function networkPreview(state: GameState, content: Content): { relay: number; outposts: number; allies: string[]; medpatch: number; damage: number } {
  const t = networkTuning(content);
  const outposts = state.legacy?.outposts?.length ?? 0;
  const relay = Math.min(t.maxRelay, outposts);
  return { relay, outposts, allies: networkAllies(state, content), medpatch: relay * t.relayMedpatch, damage: relay * t.relayDamage };
}

/** Fix the help for a party setting out on a network quest. */
export function attachSupport(state: GameState, content: Content, q: Quest): void {
  const t = networkTuning(content);
  const p = networkPreview(state, content);
  const support: QuestSupport = {
    relay: p.relay,
    allies: p.allies.map((factionId, i) => ({ factionId, timer: t.allyEvery * 0.5 + i * t.allyStagger })),
    shield: 0,
  };
  q.support = support;
  q.supplies.medpatch += p.medpatch;
  bumpMax(state, 'networkRelayMax', p.relay);
  bumpMax(state, 'networkAlliesMax', p.allies.length);
}

/** Extra party damage from the relay (1 without one). */
export function relayMult(q: Quest, content: Content): number {
  return 1 + (q.support?.relay ?? 0) * networkTuning(content).relayDamage;
}

/** Share of incoming damage the party is spared right now (Homestead 9's drill). */
export function shieldCut(q: Quest, content: Content): number {
  return q.support && q.support.shield > 0 ? networkTuning(content).shieldReduction : 0;
}

export interface SupportHooks {
  living: () => QuestEnemy[];
  standing: () => { hp: number; max: number; heal: (n: number) => void }[];
  hit: (e: QuestEnemy, amount: number) => void;
  isBoss: (e: QuestEnemy) => boolean;
  interrupt: (e: QuestEnemy) => void;
}

const LINES: Record<string, string> = {
  caravaners: 'A Long Road runner ducks in with bandages and a bill, marked "paid".',
  tinkers: 'A Scrapwright turret on the relay line opens up on everything.',
  rustmen: 'A clan champion charges in, yelling something about one and a half Rustmen.',
  lamplighters: 'A Lamplighter holds up a lamp, and something stops mid-swing.',
  homestead9: 'Tier Zero drill: "BRACE." Everybody braces.',
};

/** Allies act on their timers during a fight (called from quest combat each step). */
export function tickSupport(state: GameState, content: Content, q: Quest, dt: number, hooks: SupportHooks): void {
  const s = q.support;
  if (!s) return;
  const t = networkTuning(content);
  s.shield = Math.max(0, s.shield - dt);
  for (const a of s.allies) {
    a.timer -= dt;
    if (a.timer > 0) continue;
    a.timer += t.allyEvery;
    const enemies = hooks.living();
    if (!enemies.length) return;
    const hit = t.allyBase + t.allyPerLevel * q.level;
    const biggest = [...enemies].sort((x, y) => Number(hooks.isBoss(y)) - Number(hooks.isBoss(x)) || y.hp - x.hp)[0] as QuestEnemy;
    switch (a.factionId) {
      case 'caravaners':
        for (const m of hooks.standing()) m.heal(m.max * t.resupplyHeal);
        break;
      case 'tinkers':
        for (const e of enemies) hooks.hit(e, hit * t.turretPower);
        break;
      case 'rustmen':
        hooks.hit(biggest, hit * t.chargePower);
        break;
      case 'lamplighters': {
        const winding = enemies.find((e) => e.windup) ?? biggest;
        if (winding.windup) hooks.interrupt(winding);
        winding.stunned = Math.max(winding.stunned, t.flareStun);
        break;
      }
      case 'homestead9':
        s.shield = t.shieldSeconds;
        break;
      default:
        continue;
    }
    bump(state, 'networkSupport');
    bump(state, `networkSupport.${a.factionId}`);
    const text = LINES[a.factionId] ?? 'Help arrives from home.';
    q.log.push(text);
    if (q.log.length > 40) q.log.shift();
    state.events.push({ type: 'questSupport', questId: q.id, factionId: a.factionId, text });
  }
}
