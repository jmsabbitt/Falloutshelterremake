// Act 4's finale and the endings (GDD §11). Winning the finale (`finale: true`
// on the quest) opens the choice; the player picks one of the endings in
// endings.json, or waits. The true ending is only offered once its conditions
// hold, and the choice shows them so the player knows it exists. Choosing
// records the ending in `state.story` (lifetime: carried across foundings),
// pays its reward once (Legacy, a lasting bonus, a title), and builds an
// epilogue of slides picked by the homestead's situation: faction standing,
// legends met, awakened or lost, the outposts, the rules, and a few numbers.
//
// After an ending the game carries on. Every later homestead can hold one Rent
// Review (the post-game quest), which reopens the choice, so the other endings
// stay reachable; the review is marked undone again on each founding.

import type { Content } from '../content';
import { bump } from '../residents';
import type { EndingRecord, GameState, StoryState } from '../types';
import { factionsContent, factionTier, repOf } from './factions';
import { legendsContent } from './legends';

// ------------------------------------------------------------------ content

export type EndingConditionKind = 'factions' | 'legends' | 'stories' | 'outposts' | 'deep';

export interface EndingConditionDef {
  kind: EndingConditionKind;
  count: number;
  /** factions: the tier index needed (3 = Friendly). */
  tier?: number;
  label: string;
  /** How to get there, shown under a condition that isn't met. */
  hint: string;
}

export interface EndingBonusDef {
  /** A bonus key (bonuses.ts), added to what perks and research give. */
  effect: string;
  value: number;
}

export interface EndingDef {
  id: string;
  name: string;
  /** Short verb for the choice button ("Renew the lease"). */
  kicker: string;
  /** What choosing it means, in a sentence or two. */
  choice: string;
  /** HALCY's line about it on the choice screen. */
  halcy: string;
  /** The true ending: needs its conditions. */
  true?: boolean;
  requires?: EndingConditionDef[];
  reward: { legacy: number; title: string; bonuses: EndingBonusDef[]; text: string };
}

export type SlideVar = 'homestead' | 'cycle' | 'population' | 'peak' | 'days' | 'outposts' | 'legends' | 'friends' | 'fallen' | 'strata' | 'endings';

export interface SlideWhen {
  /** Reputation in this homestead. */
  rep?: { faction: string; min?: number; max?: number };
  legend?: { id: string; status: 'awakened' | 'met' | 'lost' | 'unmet' };
  outposts?: { min?: number; max?: number };
  survival?: boolean;
  /** Any ruleset in force (true) or none (false). */
  rules?: boolean;
  stat?: { key: SlideVar; min?: number; max?: number };
  /** Another ending was reached before this one. */
  reached?: string;
}

export interface SlideDef {
  id: string;
  /** Only in these endings (all when missing). */
  endings?: string[];
  /** Only the first matching slide of a group is shown. */
  group?: string;
  /** Categories with a cap in tuning.caps (legends: a handful, awakened first). */
  category?: string;
  when?: SlideWhen;
  title: string;
  text: string;
  /** A hint for the client's art (door, glare, relay, faction:<id>, legend:<id>, halcy...). */
  art?: string;
}

export interface EndingsContent {
  tuning: { reviewQuest: string; caps: Record<string, number> };
  endings: EndingDef[];
  slides: SlideDef[];
  credits: { heading: string; lines: string[] }[];
}

export function endingsContent(content: Content): EndingsContent {
  return (content as unknown as { endings: EndingsContent }).endings;
}

export function endingDef(content: Content, id: string): EndingDef | undefined {
  return endingsContent(content).endings.find((e) => e.id === id);
}

export function newStory(): StoryState {
  return { endings: {}, current: null, open: false, title: null };
}

/** The story state, created on first use (older states and hand-built test states lack it). */
function story(state: GameState): StoryState {
  return (state.story ??= newStory());
}

// ------------------------------------------------------------------ conditions

export interface ConditionStatus {
  kind: EndingConditionKind;
  label: string;
  hint: string;
  have: number;
  need: number;
  done: boolean;
}

/** Legend questlines finished (their legend awakened), lifetime. */
export function storiesFinished(state: GameState, content: Content): number {
  let n = 0;
  for (const line of legendsContent(content).questlines) {
    if (line.quests.length && line.quests.every((q) => state.questsDone.includes(q))) n++;
  }
  return n;
}

/** Legends met in this lifetime and not lost for good. */
export function legendsMet(state: GameState): number {
  const lost = state.legends?.lost ?? [];
  return (state.legends?.recruited ?? []).filter((id) => !lost.includes(id)).length;
}

/** Factions at this tier index or better (3 = Friendly) in this homestead. */
export function factionsAtTier(state: GameState, content: Content, tier: number): string[] {
  return factionsContent(content).factions.map((f) => f.id).filter((id) => factionTier(state, content, id) >= tier);
}

function conditionHave(state: GameState, content: Content, c: EndingConditionDef): number {
  switch (c.kind) {
    case 'factions':
      return factionsAtTier(state, content, c.tier ?? 3).length;
    case 'legends':
      return legendsMet(state);
    case 'stories':
      return storiesFinished(state, content);
    case 'outposts':
      return state.legacy?.outposts?.length ?? 0;
    case 'deep':
      return state.deep?.strata ?? 0;
  }
}

export function conditionStatus(state: GameState, content: Content, c: EndingConditionDef): ConditionStatus {
  const have = conditionHave(state, content, c);
  return { kind: c.kind, label: c.label, hint: c.hint, have, need: c.count, done: have >= c.count };
}

export interface EndingOption {
  def: EndingDef;
  conditions: ConditionStatus[];
  /** Why it can't be chosen (conditions unmet), or null. */
  locked: string | null;
  reached: boolean;
}

export function endingLocked(state: GameState, content: Content, def: EndingDef): string | null {
  const missing = (def.requires ?? []).map((c) => conditionStatus(state, content, c)).filter((c) => !c.done);
  if (!missing.length) return null;
  return `needs: ${missing.map((c) => c.label).join('; ')}`;
}

/** Every ending with its conditions, the true one last. */
export function endingOptions(state: GameState, content: Content): EndingOption[] {
  return endingsContent(content)
    .endings.slice()
    .sort((a, b) => Number(a.true === true) - Number(b.true === true))
    .map((def) => ({
      def,
      conditions: (def.requires ?? []).map((c) => conditionStatus(state, content, c)),
      locked: endingLocked(state, content, def),
      reached: story(state).endings[def.id] !== undefined,
    }));
}

/** The finale is won here and the choice is waiting. */
export function endingChoiceOpen(state: GameState): boolean {
  const s = story(state);
  return s.open && s.current === null;
}

/** The finale (or a Rent Review) was won: the choice opens, once per homestead. */
export function openFinale(state: GameState, content: Content): void {
  void content;
  const s = story(state);
  if (s.open || s.current) return;
  s.open = true;
  bump(state, 'finalesWon');
  state.events.push({ type: 'endingOffered' });
}

// ------------------------------------------------------------------ epilogue

export interface Slide {
  id: string;
  title: string;
  text: string;
  art?: string;
}

/** The numbers an epilogue quotes, as they stand now. */
export function slideVars(state: GameState, content: Content): Record<SlideVar, number> {
  const living = state.residents.filter((r) => !r.dead && !r.waiting);
  return {
    homestead: state.homesteadNumber,
    cycle: state.legacy?.cycle ?? 1,
    population: living.length,
    peak: state.peakPopulation,
    days: Math.max(1, Math.floor(state.time / 86400)),
    outposts: state.legacy?.outposts?.length ?? 0,
    legends: legendsMet(state),
    friends: factionsAtTier(state, content, 3).length,
    // This homestead's fallen: bodies still here plus those laid to rest since founding (stats are lifetime).
    fallen: state.residents.filter((r) => r.dead).length + Math.max(0, (state.stats['laidToRest'] ?? 0) - (state.legacy?.statsAtFounding?.['laidToRest'] ?? 0)),
    strata: state.deep?.strata ?? 0,
    endings: Object.keys(story(state).endings).length,
  };
}

function legendState(state: GameState, content: Content, id: string): 'awakened' | 'met' | 'lost' | 'unmet' {
  if (state.legends?.lost?.includes(id)) return 'lost';
  if (!state.legends?.recruited.includes(id)) return 'unmet';
  const line = legendsContent(content).questlines.find((l) => l.legend === id);
  if (line && line.quests.length && line.quests.every((q) => state.questsDone.includes(q))) return 'awakened';
  return 'met';
}

const within = (v: number, r: { min?: number; max?: number }) => (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);

/** Whether a slide's conditions hold (the `endings` filter is checked by the caller). */
export function slideMatches(state: GameState, content: Content, w: SlideWhen | undefined, vars: Record<SlideVar, number>, endingId: string): boolean {
  if (!w) return true;
  if (w.rep && !within(repOf(state, content, w.rep.faction), w.rep)) return false;
  if (w.legend) {
    const have = legendState(state, content, w.legend.id);
    // Awakened legends are met too, so a "met" slide can follow an awakened group miss.
    const ok = w.legend.status === 'met' ? have === 'met' || have === 'awakened' : have === w.legend.status;
    if (!ok) return false;
  }
  if (w.outposts && !within(vars.outposts, w.outposts)) return false;
  if (w.survival !== undefined && (state.rules?.survival === true) !== w.survival) return false;
  if (w.rules !== undefined && (state.rules?.ids?.length ?? 0) > 0 !== w.rules) return false;
  if (w.stat && !within(vars[w.stat.key], w.stat)) return false;
  if (w.reached !== undefined) {
    const rec = story(state).endings[w.reached];
    if (!rec || w.reached === endingId) return false;
  }
  return true;
}

/** Fill {homestead}, {population}... in a slide's text. */
export function fillSlide(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** The slide ids an ending's epilogue would show right now. */
export function epilogueSlideIds(state: GameState, content: Content, endingId: string): string[] {
  const ec = endingsContent(content);
  const vars = slideVars(state, content);
  const groups = new Set<string>();
  // Legends in a capped category: awakened stories first, then losses, then the rest.
  const rank = (d: SlideDef) => (d.category && d.when?.legend ? { awakened: 0, lost: 1, met: 2, unmet: 3 }[d.when.legend.status] : 0);
  const picked: SlideDef[] = [];
  for (const d of ec.slides) {
    if (d.endings && !d.endings.includes(endingId)) continue;
    if (d.group && groups.has(d.group)) continue;
    if (!slideMatches(state, content, d.when, vars, endingId)) continue;
    if (d.group) groups.add(d.group);
    picked.push(d);
  }
  // Apply the caps, keeping the best-ranked slides of each category but the file's order.
  const keep = new Set<string>();
  const byCat = new Map<string, SlideDef[]>();
  for (const d of picked) {
    if (!d.category || ec.tuning.caps[d.category] === undefined) keep.add(d.id);
    else byCat.set(d.category, [...(byCat.get(d.category) ?? []), d]);
  }
  for (const [cat, list] of byCat) {
    const cap = ec.tuning.caps[cat] ?? list.length;
    for (const d of [...list].sort((a, b) => rank(a) - rank(b)).slice(0, cap)) keep.add(d.id);
  }
  return picked.filter((d) => keep.has(d.id)).map((d) => d.id);
}

function toSlides(content: Content, ids: string[], vars: Record<string, string | number>): Slide[] {
  const byId = new Map(endingsContent(content).slides.map((d) => [d.id, d]));
  return ids.flatMap((id) => {
    const d = byId.get(id);
    return d ? [{ id, title: fillSlide(d.title, vars), text: fillSlide(d.text, vars), art: d.art }] : [];
  });
}

/** The epilogue an ending would play now (the choice screen previews nothing: it's for after). */
export function epilogue(state: GameState, content: Content, endingId: string): Slide[] {
  return toSlides(content, epilogueSlideIds(state, content, endingId), slideVars(state, content));
}

/** A reached ending's epilogue as it played last time (Goals and the Collection Log replay it). */
export function replayEpilogue(state: GameState, content: Content, endingId: string): Slide[] | null {
  const rec = story(state).endings[endingId];
  if (!rec) return null;
  return toSlides(content, rec.slides, rec.vars);
}

// ------------------------------------------------------------------ choosing

/** Choose how it ends. Pays the reward the first time each ending is reached. */
export function chooseEnding(state: GameState, content: Content, endingId: string): string | null {
  const def = endingDef(content, endingId);
  if (!def) return 'no such ending';
  const s = story(state);
  if (s.current) return 'this homestead has already chosen';
  if (!s.open) return 'win the finale first';
  const locked = endingLocked(state, content, def);
  if (locked) return locked;

  const vars = slideVars(state, content);
  const slides = epilogueSlideIds(state, content, endingId);
  const prior: EndingRecord | undefined = s.endings[endingId];
  const first = !prior;
  s.endings[endingId] = {
    count: (prior?.count ?? 0) + 1,
    firstCycle: prior?.firstCycle ?? vars.cycle,
    firstHomestead: prior?.firstHomestead ?? vars.homestead,
    slides,
    vars: { ...vars },
  };
  s.current = endingId;
  s.open = false;
  s.title = def.reward.title;
  if (first && def.reward.legacy > 0) {
    state.legacy.points += def.reward.legacy;
    state.legacy.earned += def.reward.legacy;
    bump(state, 'legacyEarned', def.reward.legacy);
  }
  bump(state, 'endingsReached');
  bump(state, `ending.${endingId}`);
  state.stats['endingsDistinct'] = Object.keys(s.endings).length;
  state.events.push({ type: 'endingReached', endingId, first });
  return null;
}

/** Wear the title of a reached ending in the HUD (null takes it off). */
export function setEndingTitle(state: GameState, content: Content, endingId: string | null): string | null {
  const s = story(state);
  if (endingId === null) {
    s.title = null;
    return null;
  }
  const def = endingDef(content, endingId);
  if (!def) return 'no such ending';
  if (!s.endings[endingId]) return 'reach that ending first';
  s.title = def.reward.title;
  return null;
}

/** The title shown in the HUD, if any. */
export function endingTitle(state: GameState): string | null {
  return state.story?.title ?? null;
}

/** Lasting bonus from every ending reached (each counts once, however often it was chosen). */
export function endingBonus(state: GameState, content: Content, effect: string): number {
  const reached = state.story?.endings;
  if (!reached) return 0;
  let total = 0;
  for (const def of endingsContent(content).endings) {
    if (!reached[def.id]) continue;
    for (const b of def.reward.bonuses) if (b.effect === effect) total += b.value;
  }
  return total;
}

// ------------------------------------------------------------------ founding

/**
 * The story carries to a new homestead: endings and the title stay, the
 * choice is per homestead, and the Rent Review can be held once more.
 */
export function carryStory(src: GameState, dst: GameState, content: Content): void {
  const s = story(src);
  dst.story = { endings: structuredClone(s.endings), current: null, open: false, title: s.title };
  const review = endingsContent(content).tuning.reviewQuest;
  dst.questsDone = dst.questsDone.filter((id) => id !== review);
}
