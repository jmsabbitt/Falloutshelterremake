// M6 notification centre (GDD §6.6): a log of what happened, grouped with
// icons, plus a "While you were away" section filled from the offline
// catch-up summary and the events it raised. Kept in localStorage per
// homestead so it survives a reload; cleared on demand.

import { cacheDef, deepContent, legendDef, legendName, questContent, researchNode, roomDef, type GameEvent, type ResourceKey } from '../../sim';
import type { AwayReport, Game } from '../game';
import { readJson, writeJson } from '../storage';
import { ask } from './confirm';
import { duration, fmt, h } from './dom';
import { nameList, plural } from './qolText';
import { STAT_WORD } from './training';

const STAT_ORDER = Object.keys(STAT_WORD);

export type NoticeGroup = 'people' | 'incidents' | 'glare' | 'quests' | 'crafting' | 'rewards' | 'homestead';
type Tone = 'good' | 'bad' | 'gold';

export interface Notice {
  id: number;
  /** Wall-clock ms. */
  at: number;
  group: NoticeGroup;
  icon: string;
  text: string;
  tone?: Tone;
}

interface AwayLog {
  at: number;
  seconds: number;
  lines: string[];
  notices: Notice[];
}

interface Stored {
  home: string;
  nextId: number;
  seenAt: number;
  log: Notice[];
  away: AwayLog | null;
}

export const GROUPS: Record<NoticeGroup, { label: string; icon: string }> = {
  people: { label: 'Residents', icon: '👥' },
  incidents: { label: 'Incidents', icon: '⚠' },
  glare: { label: 'Glarelands', icon: '🧭' },
  quests: { label: 'Quests', icon: '⚔' },
  crafting: { label: 'Crafting', icon: '🔧' },
  rewards: { label: 'Rewards', icon: '🏆' },
  homestead: { label: 'Homestead', icon: '🏠' },
};

const KEY = 'homestead.notices';
const LOG_MAX = 200;
const AWAY_MAX = 80;
const RESOURCE: Record<ResourceKey, string> = { power: 'power', food: 'food', water: 'water', medpatch: 'Med-Patches', purge: 'Purge' };

/** One event, described. Events with the same `key` in one batch fold into a single line. */
interface Line {
  key: string;
  group: NoticeGroup;
  icon: string;
  tone?: Tone;
  /** The text when it stands alone. */
  one: string;
  /** A short part for the folded line ("Ada (L5)"). */
  part?: string;
  /** Parts with the same id replace each other (one resident levelling twice shows once, at the new level). */
  partId?: number;
  /** The folded text for n > 1. */
  many?: (parts: string[], n: number) => string;
  /** Numbers to sum when folding (collected resources). */
  sum?: Partial<Record<string, number>>;
}

export class NoticeCentre {
  private data: Stored;
  private filter: NoticeGroup | 'all' = 'all';
  /** Entries after this are marked new while the panel is open. */
  private highlightSince = 0;
  private seenAway: AwayReport | null = null;
  private escaped = new Set<number>();
  private saveTimer: number | null = null;
  /** Names and titles remembered so late events (after a quest is collected) can still name them. */
  private questTitles = new Map<number, string>();
  private explorerOf = new Map<number, number>();

  constructor(private game: Game) {
    this.data = this.load();
    this.ingestAway();
  }

  private homeKey(): string {
    const s = this.game.state;
    return `${s.legacy.cycle}:${s.homesteadNumber}`;
  }

  private load(): Stored {
    const saved = readJson<Stored>(KEY);
    if (saved && saved.home === this.homeKey() && Array.isArray(saved.log)) return saved;
    return { home: this.homeKey(), nextId: 1, seenAt: Date.now(), log: [], away: null };
  }

  private persist(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      writeJson(KEY, this.data);
    }, 1500);
  }

  /** New homestead: a fresh log. */
  onStateReplaced(): void {
    this.data = { home: this.homeKey(), nextId: 1, seenAt: Date.now(), log: [], away: null };
    this.seenAway = null;
    this.questTitles.clear();
    this.explorerOf.clear();
    writeJson(KEY, this.data);
  }

  unread(): number {
    const seen = this.data.seenAt;
    return this.data.log.filter((n) => n.at > seen).length + (this.data.away && this.data.away.at > seen ? 1 : 0);
  }

  /** The panel opened: highlight what is new since the last look, and count it as read. */
  opened(): void {
    this.highlightSince = this.data.seenAt;
    this.markRead();
  }

  /** Everything logged so far has been seen (called while the panel is open). */
  markRead(): void {
    if (this.unread() === 0) return;
    this.data.seenAt = Date.now();
    this.persist();
  }

  clear(): void {
    this.data.log = [];
    this.data.away = null;
    this.data.seenAt = Date.now();
    writeJson(KEY, this.data);
  }

  // ---------------------------------------------------------------- intake

  /** Called with every flush of sim events. */
  onEvents(events: GameEvent[]): void {
    const { state } = this.game;
    for (const q of state.quests) this.questTitles.set(q.id, q.title);
    for (const e of state.expeditions) this.explorerOf.set(e.id, e.residentId);
    for (const ev of events) if (ev.type === 'expeditionStarted') this.explorerOf.set(ev.expeditionId, ev.residentId);
    if (this.game.flushingAway) {
      // These belong to the away section; ingestAway() reads them from game.lastAway.
      this.ingestAway();
      return;
    }
    const lines = this.fold(events, false);
    if (!lines.length) return;
    const now = Date.now();
    for (const n of lines) this.data.log.unshift({ ...n, id: this.data.nextId++, at: now });
    if (this.data.log.length > LOG_MAX) this.data.log.length = LOG_MAX;
    this.persist();
  }

  /** Pull in the latest absence (on load, the catch-up events were flushed before any listener existed). */
  private ingestAway(): void {
    const rep = this.game.lastAway;
    if (!rep || rep === this.seenAway) return;
    this.seenAway = rep;
    if (this.data.away && this.data.away.at === rep.at) return;
    const s = rep.summary;
    const names = (ids: number[]) => nameList(ids.map((id) => this.name(id)));
    const lines = [
      `${duration(s.seconds)} passed${s.cappedAt ? ` (offline progress stops at ${duration(s.cappedAt)})` : ''}.`,
      s.readyRooms ? `${plural(s.readyRooms, 'room')} ready to collect.` : '',
      s.births ? `${plural(s.births, 'baby', 'babies')} born.` : '',
      s.arrivals ? `${plural(s.arrivals, 'new arrival')} at the door.` : '',
      s.explorersHome.length ? `${names(s.explorersHome)} came home from the Glarelands.` : '',
      s.explorersFallen.length ? `${names(s.explorersFallen)} fell in the Glarelands.` : '',
    ].filter(Boolean);
    const notices = this.fold(rep.events, true)
      .slice(0, AWAY_MAX)
      .map((n, i) => ({ ...n, id: -1 - i, at: rep.at }));
    this.data.away = { at: rep.at, seconds: s.seconds, lines, notices };
    this.persist();
  }

  private name(id: number): string {
    return this.game.state.residents.find((r) => r.id === id)?.firstName ?? 'Someone';
  }

  private explorer(expeditionId: number): string {
    const id = this.game.state.expeditions.find((e) => e.id === expeditionId)?.residentId ?? this.explorerOf.get(expeditionId);
    return id === undefined ? 'An explorer' : this.name(id);
  }

  private quest(id: number): string {
    return this.game.state.quests.find((q) => q.id === id)?.title ?? this.questTitles.get(id) ?? 'the quest';
  }

  private roomName(id: number): string {
    const room = this.game.state.rooms.find((r) => r.id === id);
    return room ? roomDef(this.game.content, room).name : 'a room';
  }

  /** Describe a batch, folding same-kind events into one line each, in first-seen order. */
  private fold(events: GameEvent[], away: boolean): Omit<Notice, 'id' | 'at'>[] {
    const groups = new Map<string, { line: Line; parts: string[]; ids: (number | undefined)[]; n: number; sum: Record<string, number> }>();
    // M9: an incident that left on its own also raises incidentResolved; that one is not a win.
    this.escaped = new Set(events.filter((e) => e.type === 'incidentEscaped').map((e) => (e as { incidentId: number }).incidentId));
    for (const ev of events) {
      const line = this.describe(ev, away);
      if (!line) continue;
      const g = groups.get(line.key);
      if (g) {
        const at = line.partId !== undefined ? g.ids.indexOf(line.partId) : -1;
        if (at >= 0 && line.part) {
          g.parts[at] = line.part;
          if (g.n === 1) g.line = { ...g.line, one: line.one };
          continue;
        }
        g.n++;
        if (line.part && g.parts.length < 12) {
          g.parts.push(line.part);
          g.ids.push(line.partId);
        }
        for (const [k, v] of Object.entries(line.sum ?? {})) g.sum[k] = (g.sum[k] ?? 0) + (v ?? 0);
      } else {
        groups.set(line.key, { line, parts: line.part ? [line.part] : [], ids: [line.partId], n: 1, sum: { ...(line.sum as Record<string, number>) } });
      }
    }
    const out: Omit<Notice, 'id' | 'at'>[] = [];
    for (const { line, parts, n, sum } of groups.values()) {
      let text = n > 1 && line.many ? line.many(parts, n) : line.one;
      if (line.key === 'collected') {
        const bits = Object.entries(sum)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${fmt(v)} ${RESOURCE[k as ResourceKey] ?? k}`);
        text = `${plural(n, 'batch', 'batches')} collected: ${bits.join(', ')}.`;
      }
      out.push({ group: line.group, icon: line.icon, text, tone: line.tone });
    }
    return out;
  }

  private describe(ev: GameEvent, away: boolean): Line | null {
    const { content } = this.game;
    const people = (key: string, icon: string, one: string, part: string, many: (p: string[], n: number) => string, tone?: Tone): Line => ({ key, group: 'people', icon, one, part, many, tone });
    switch (ev.type) {
      // ---- residents
      case 'residentArrived': {
        const who = this.name(ev.residentId);
        const how = ev.source === 'radio' ? 'heard the radio and' : ev.source === 'crate' ? 'came out of a crate and' : 'wandered in and';
        return people('arrived', '🚪', `${who} ${how} is at the door.`, who, (p, n) => `${n} new arrivals at the door: ${nameList(p)}.`);
      }
      case 'birth':
        return people('birth', '👶', `${this.name(ev.motherId)} had a baby: welcome, ${this.name(ev.childId)}!`, this.name(ev.childId), (p, n) => `${n} babies born: ${nameList(p)}.`, 'gold');
      case 'pregnancy':
        return people('pregnancy', '💕', `${this.name(ev.motherId)} and ${this.name(ev.fatherId)} are expecting.`, this.name(ev.motherId), (p, n) => `${n} couples are expecting (${nameList(p)}).`, 'good');
      case 'grewUp':
        return people('grewUp', '🎓', `${this.name(ev.residentId)} grew up and is ready to work.`, this.name(ev.residentId), (p, n) => `${n} children grew up: ${nameList(p)}.`, 'good');
      case 'residentLeveled':
        return { ...people('leveled', '⬆', `${this.name(ev.residentId)} reached level ${ev.level}.`, `${this.name(ev.residentId)} (L${ev.level})`, (p, n) => `${plural(n, 'resident')} levelled up: ${nameList(p, 4)}.`), partId: ev.residentId };
      case 'residentDied':
        return people('died', '☠', `${this.name(ev.residentId)} has fallen.`, this.name(ev.residentId), (p, n) => `${n} residents fell: ${nameList(p)}.`, 'bad');
      case 'residentRevived':
        return people('revived', '✚', `${this.name(ev.residentId)} was revived.`, this.name(ev.residentId), (p, n) => `${n} residents revived: ${nameList(p)}.`, 'good');
      case 'autoAssigned':
        return { key: 'autoAssigned', group: 'people', icon: '⚙', one: `Auto-assign put ${plural(ev.count, 'resident')} to work.`, part: `${ev.count}`, many: (p) => `Auto-assign put ${p.reduce((a, b) => a + Number(b), 0)} residents to work.` };
      case 'statTrained': {
        const stat = STAT_WORD[ev.stat];
        const who = this.name(ev.residentId);
        const how = ev.source === 'level' ? ' (level milestone)' : '';
        return {
          ...people('statTrained', ev.value >= 10 ? '🏅' : '💪', `${who}'s ${stat} rose to ${ev.value}${how}.`, `${who} (${stat} ${ev.value})`, (p, n) => `${plural(n, 'stat point')} gained: ${nameList(p, 4)}.`, ev.value >= 10 ? 'gold' : 'good'),
          partId: ev.residentId * 10 + STAT_ORDER.indexOf(ev.stat),
        };
      }
      case 'masteryUp': {
        const tier = (content.traits as { tuning?: { masteryTierNames?: string[] } }).tuning?.masteryTierNames?.[ev.tier] ?? `tier ${ev.tier + 1}`;
        const job = content.rooms[ev.roomType]?.name ?? ev.roomType;
        return people('mastery', '🎖', `${this.name(ev.residentId)} is now ${tier} at the ${job}.`, this.name(ev.residentId), (p, n) => `${n} residents got better at their jobs: ${nameList(p)}.`, 'good');
      }
      // ---- incidents
      case 'incidentStarted': {
        const name = (content.balance.incidents.types as Record<string, { name?: string }>)[ev.incident]?.name ?? 'Incident';
        return { key: `inc-${ev.incidentId}`, group: 'incidents', icon: '⚠', one: `${name} in the ${this.roomName(ev.roomId)}!`, tone: 'bad' };
      }
      case 'doorBreached':
        return { key: 'breach', group: 'incidents', icon: '🚪', one: 'Raiders broke through the door.', tone: 'bad' };
      case 'incidentResolved': {
        if (this.escaped.has(ev.incidentId)) return null;
        const name = (content.balance.incidents.types as Record<string, { name?: string }>)[ev.incident]?.name ?? 'Incident';
        const text = ev.incident === 'rustmen' ? (ev.loot > 0 ? `Raiders repelled. Recovered ${fmt(ev.loot)} scrip.` : 'The raiders got away with their loot.') : `${name} dealt with in the ${this.roomName(ev.roomId)}.`;
        return { key: `res-${ev.incidentId}`, group: 'incidents', icon: '✔', one: text, tone: ev.incident === 'rustmen' && ev.loot <= 0 ? 'bad' : 'good' };
      }
      case 'incidentMoved':
        return { key: `moved-${ev.incidentId}`, group: 'incidents', icon: '🕸', one: `${(content.balance.incidents.types as Record<string, { name?: string }>)[ev.incident]?.name ?? 'Something'} jumped into the ${this.roomName(ev.roomId)}.`, tone: 'bad' };
      case 'incidentEscaped': {
        const name = (content.balance.incidents.types as Record<string, { name?: string }>)[ev.incident]?.name ?? 'Something';
        return { key: `esc-${ev.incidentId}`, group: 'incidents', icon: '↗', one: ev.incident === 'maulers' ? 'The Mauler wandered off. It will be back.' : `${name} left the homestead on its own.` };
      }
      case 'maulerStirring':
        return { key: 'stirring', group: 'incidents', icon: '⚠', one: `Something big is paying attention (Mauler meter ${Math.round(ev.meter * 100)}%).`, tone: 'bad' };
      case 'bossFirstKill': {
        const enemy = questContent(content).enemies[ev.enemyId]?.name ?? 'A boss';
        return { key: `fk-${ev.enemyId}`, group: 'quests', icon: '☠', one: `First kill: ${enemy}. ${content.items[ev.defId]?.name ?? 'A trophy'} goes in the quest loot.`, tone: 'gold' };
      }
      case 'treasureMapFound':
        return { key: `map-${ev.mapId}`, group: 'glare', icon: '🗺', one: `Treasure map found: ${cacheDef(content, ev.cacheId)?.name ?? 'a cache'}. Dig it up in its region.`, tone: 'gold' };
      case 'cacheDug':
        return { key: `cache-${ev.cacheId}`, group: 'glare', icon: '⛏', one: `${this.explorer(ev.expeditionId)} dug up ${cacheDef(content, ev.cacheId)?.name ?? 'a cache'}.`, tone: 'gold' };
      case 'legendArrived': {
        const d = legendDef(content, ev.legendId);
        return people(`legend-${ev.legendId}`, '★', ev.source === 'recall' ? `${d?.firstName ?? 'A legend'} is back from the outpost.` : `Legendary resident: ${d ? legendName(d) : 'someone'} is at the door.`, d?.firstName ?? '', (p) => `Legends at the door: ${nameList(p)}.`, 'gold');
      }
      case 'legendAwakened': {
        const d = legendDef(content, ev.legendId);
        return people(`awake-${ev.legendId}`, '★', `${d?.firstName ?? 'A legend'}'s signature trait awakened.`, d?.firstName ?? '', (p) => `Awakened: ${nameList(p)}.`, 'gold');
      }
      // ---- the Glarelands
      case 'expeditionStarted':
        return { key: `exp-start-${ev.expeditionId}`, group: 'glare', icon: '🧭', one: `${this.name(ev.residentId)} set out into the Glarelands.` };
      case 'expeditionReturning':
        return ev.reason === 'full' ? { key: `exp-full-${ev.expeditionId}`, group: 'glare', icon: '🎒', one: `${this.explorer(ev.expeditionId)} couldn't carry any more and headed home.` } : null;
      case 'expeditionReturned':
        return { key: 'exp-home', group: 'glare', icon: '🏠', one: `${this.explorer(ev.expeditionId)} is back from the Glarelands. Collect in Explore.`, part: this.explorer(ev.expeditionId), many: (p) => `${nameList(p)} are back from the Glarelands. Collect in Explore.`, tone: 'gold' };
      case 'expeditionCollected':
        return { key: `exp-col-${ev.expeditionId}`, group: 'glare', icon: '🎒', one: `${this.explorer(ev.expeditionId)} unpacked${ev.loot.scrip ? ` ${fmt(ev.loot.scrip)} scrip` : ''}${ev.loot.items.length ? ` and ${plural(ev.loot.items.length, 'item')}` : ''}.`, tone: 'good' };
      case 'explorerDied':
        return { key: `exp-dead-${ev.expeditionId}`, group: 'glare', icon: '☠', one: `${this.name(ev.residentId)} fell in the Glarelands.`, tone: 'bad' };
      // ---- quests
      case 'questStarted':
        return { key: `q-start-${ev.questId}`, group: 'quests', icon: '⚔', one: `A party set out for ${this.quest(ev.questId)}.` };
      case 'questArrived':
        return { key: `q-arr-${ev.questId}`, group: 'quests', icon: '🚩', one: `The party reached ${this.quest(ev.questId)}.`, tone: 'gold' };
      case 'questFinished':
        return {
          key: `q-fin-${ev.questId}`,
          group: 'quests',
          icon: ev.outcome === 'success' ? '🏆' : ev.outcome === 'failed' ? '☠' : '↩',
          one: ev.outcome === 'success' ? `${this.quest(ev.questId)} complete.` : ev.outcome === 'failed' ? `The party fell at ${this.quest(ev.questId)}.` : `The party retreated from ${this.quest(ev.questId)}.`,
          tone: ev.outcome === 'success' ? 'gold' : ev.outcome === 'failed' ? 'bad' : undefined,
        };
      case 'questReturned':
        return { key: `q-ret-${ev.questId}`, group: 'quests', icon: '🏠', one: `The party is home from ${this.quest(ev.questId)}. Collect in Quests.`, tone: 'gold' };
      case 'questCollected':
        return { key: `q-col-${ev.questId}`, group: 'quests', icon: '🎁', one: ev.outcome === 'success' ? `Rewards from ${this.quest(ev.questId)} unpacked.` : `The party from ${this.quest(ev.questId)} is back inside.`, tone: 'good' };
      case 'contractsRefreshed':
        return { key: 'contracts', group: 'quests', icon: '📋', one: 'New bounty contracts are posted at the Command Office.' };
      // ---- crafting
      case 'craftFinished': {
        const item = content.items[ev.defId]?.name ?? 'An item';
        return { key: 'craft-done', group: 'crafting', icon: '🔧', one: `${item} is ready in the ${this.roomName(ev.roomId)}.`, part: item, many: (p) => `Ready to collect: ${nameList(p)}.`, tone: 'gold' };
      }
      case 'craftCollected':
        return { key: 'craft-col', group: 'crafting', icon: '📦', one: `${content.items[ev.defId]?.name ?? 'An item'} went into storage.`, part: content.items[ev.defId]?.name ?? 'an item', many: (p) => `Into storage: ${nameList(p)}.` };
      case 'recipeUnlocked':
        return { key: `recipe-${ev.defId}`, group: 'crafting', icon: '📜', one: `Recipe learned: ${content.items[ev.defId]?.name ?? ev.defId}.`, tone: 'gold' };
      case 'fragmentFound':
        return { key: 'fragment', group: 'crafting', icon: '📜', one: `Blueprint fragment: ${content.items[ev.defId]?.name ?? ev.defId} (${ev.have}/${ev.need}).`, part: content.items[ev.defId]?.name ?? ev.defId, many: (p, n) => `${n} blueprint fragments: ${nameList(p)}.`, tone: 'good' };
      case 'reforged':
        return { key: `reforge-${ev.result}`, group: 'crafting', icon: '⚗', one: ev.upgraded ? `Reforge succeeded: ${content.items[ev.result]?.name ?? ev.result}!` : `Reforged into ${content.items[ev.result]?.name ?? ev.result}.`, tone: ev.upgraded ? 'gold' : undefined };
      // ---- rewards
      case 'achievementUnlocked': {
        const a = content.achievements.find((x) => x.id === ev.achievementId);
        return { key: `ach-${ev.achievementId}`, group: 'rewards', icon: '🏆', one: a ? `${a.name}: ${a.description}` : 'Achievement earned.', tone: 'gold' };
      }
      case 'crateEarned':
        return { key: `crate-${ev.tier}`, group: 'rewards', icon: '📦', one: `${ev.tier === 'standard' ? 'Supply' : ev.tier === 'rare' ? 'Rare' : 'Legendary'} Crate earned (${ev.source}).`, part: ev.source, many: (p, n) => `${n} ${ev.tier === 'standard' ? 'Supply' : ev.tier === 'rare' ? 'Rare' : 'Legendary'} Crates earned.`, tone: ev.tier === 'standard' ? 'good' : 'gold' };
      case 'roomUnlocked':
        return { key: `unlock-${ev.roomType}`, group: 'rewards', icon: '🔓', one: `New room unlocked: ${content.rooms[ev.roomType]?.name ?? ev.roomType}.`, tone: 'gold' };
      case 'charterReached':
        return { key: 'charter', group: 'rewards', icon: '◆', one: 'The Charter is within reach. See Legacy.', tone: 'gold' };
      case 'outpostsCollected':
        return { key: 'outposts', group: 'rewards', icon: '◆', one: `Outposts sent ${fmt(ev.scrip)} scrip${ev.crates ? ` and ${plural(ev.crates, 'crate')}` : ''}.`, tone: 'good' };
      // ---- the homestead
      case 'roomBuilt':
        return { key: 'built', group: 'homestead', icon: '🏗', one: `Built a ${content.rooms[ev.roomType]?.name ?? ev.roomType}.`, part: content.rooms[ev.roomType]?.name ?? ev.roomType, many: (p, n) => `Built ${n} rooms (${nameList([...new Set(p)])}).` };
      case 'roomUpgraded':
        return { key: 'upgraded', group: 'homestead', icon: '⬆', one: `The ${this.roomName(ev.roomId)} is now level ${ev.level}.`, part: this.roomName(ev.roomId), many: (p, n) => `${n} rooms upgraded.` };
      case 'roomsMerged':
        return ev.segments === 3 ? { key: 'triple', group: 'homestead', icon: '▦', one: `Rooms merged into a triple ${this.roomName(ev.roomId)}.`, tone: 'good' } : null;
      case 'storageFull':
        return { key: 'storageFull', group: 'homestead', icon: '📦', one: `Storage full: sold ${content.items[ev.defId]?.name ?? 'an item'} for ${ev.sold} scrip. Build a Storeroom.`, part: `${ev.sold}`, many: (p, n) => `Storage full: sold ${n} items for ${p.reduce((a, b) => a + Number(b), 0)} scrip. Build a Storeroom.`, tone: 'bad' };
      case 'researchDone':
        return { key: `research-${ev.nodeId}`, group: 'homestead', icon: '🔬', one: `Research complete: ${researchNode(content, ev.nodeId)?.name ?? ev.nodeId}.`, tone: 'gold' };
      case 'digFinished':
        return { key: `dig-${ev.stratum}`, group: 'homestead', icon: '⛏', one: `Excavation finished: stratum ${ev.stratum} is open.`, tone: 'gold' };
      case 'discovery': {
        const d = deepContent(content).discoveries?.[ev.discoveryId];
        return { key: `disc-${ev.discoveryId}`, group: 'homestead', icon: '📜', one: `Discovery in the Deep: ${d?.title ?? 'something old'}.`, tone: 'gold' };
      }
      case 'collected':
        // The player's own taps are noise; batches gathered while away (offline, or by conveyors) are news.
        return away ? { key: 'collected', group: 'homestead', icon: '⤓', one: '', sum: { [ev.resource]: ev.amount } } : null;
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------- panel

  panel(onChange: () => void): HTMLElement {
    const { log, away } = this.data;
    const shown = this.filter === 'all' ? log : log.filter((n) => n.group === this.filter);
    const counts = new Map<NoticeGroup, number>();
    for (const n of log) counts.set(n.group, (counts.get(n.group) ?? 0) + 1);
    const chip = (key: NoticeGroup | 'all', label: string, n: number) =>
      h(
        'button',
        {
          class: `rl-chip${this.filter === key ? ' active' : ''}${n === 0 && key !== 'all' ? ' empty' : ''}`,
          'aria-pressed': this.filter === key ? 'true' : 'false',
          onclick: () => {
            this.filter = key;
            onChange();
          },
        },
        label,
        h('span', { class: 'n' }, `${n}`),
      );
    const chips = h(
      'div',
      { class: 'rl-filters' },
      chip('all', 'All', log.length),
      ...(Object.keys(GROUPS) as NoticeGroup[]).map((g) => chip(g, `${GROUPS[g].icon} ${GROUPS[g].label}`, counts.get(g) ?? 0)),
    );
    const awayNotices = away ? (this.filter === 'all' ? away.notices : away.notices.filter((n) => n.group === this.filter)) : [];
    const awayBox = away
      ? h(
          'section',
          { class: 'nc-away' },
          h('div', { class: 'row', style: 'margin:0 0 4px' }, h('b', {}, '🌙 While you were away'), h('span', { class: 'muted small' }, clock(away.at))),
          ...away.lines.map((t) => h('div', { class: 'nc-away-line' }, t)),
          ...awayNotices.map((n) => this.item(n)),
          away.notices.length && !awayNotices.length ? h('div', { class: 'muted small' }, 'Nothing of this kind while you were away.') : null,
        )
      : null;
    return h(
      'div',
      { class: 'body nc-body' },
      h(
        'div',
        { class: 'row', style: 'margin-top:0' },
        h('span', { class: 'muted' }, log.length || away ? `${plural(log.length, 'entry', 'entries')} · newest first` : 'Nothing logged yet.'),
        h(
          'button',
          {
            class: 'danger',
            disabled: !log.length && !away,
            onclick: () =>
              ask({ title: 'Clear the notification log?', text: 'Every entry is removed from the log.', ok: 'Clear', danger: true }, () => {
                this.clear();
                onChange();
              }),
          },
          'Clear',
        ),
      ),
      chips,
      awayBox,
      awayBox && shown.length ? h('h3', { class: 'group' }, 'Recent') : null,
      ...shown.slice(0, 120).map((n) => this.item(n)),
      !shown.length && !away ? h('p', { class: 'muted' }, 'Arrivals, births, incidents, quests, crafting, level-ups and achievements show up here as they happen.') : null,
    );
  }

  private item(n: Notice): HTMLElement {
    return h(
      'div',
      { class: `nc-item ${n.tone ?? ''}${n.at > this.highlightSince ? ' new' : ''}` },
      h('span', { class: 'nc-icon', title: GROUPS[n.group].label }, n.icon),
      h('span', { class: 'nc-text' }, n.text),
      h('span', { class: 'nc-time' }, clock(n.at)),
    );
  }
}

/** "14:05" today, "Tue 14:05" otherwise. */
function clock(ms: number): string {
  const d = new Date(ms);
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date();
  return d.toDateString() === today.toDateString() ? t : `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${t}`;
}
