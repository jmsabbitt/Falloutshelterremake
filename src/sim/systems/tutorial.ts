// The first-homestead tutorial. A tutorial homestead starts with only the door
// and the elevator shaft; HALCY walks the Warden through letting the founders
// in, building (free) and staffing power, water and food on either side of the
// shaft, collecting a batch and opening a Supply Crate.
//
// Every step is a condition on the state, checked after each command and each
// tick, so progress is deterministic and survives saving and loading.

import type { Content } from '../content';
import { canPlace, roomDef } from '../grid';
import { bump } from '../residents';
import type { GameState, Room, TutorialStep } from '../types';

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  'admit',
  'build_power',
  'staff_power',
  'build_water',
  'staff_water',
  'build_food',
  'staff_food',
  'collect',
  'crate',
  'equip',
  'done',
];

/** The three rooms the tutorial has the Warden build, in order. */
export const TUTORIAL_ROOMS = { power: 'generator', water: 'waterworks', food: 'canteen' } as const;

/** Where the classic starter layout puts them (used by Skip). */
const CLASSIC_SPOT: Record<string, { floor: number; x: number }> = {
  generator: { floor: 1, x: 7 },
  canteen: { floor: 1, x: 10 },
  waterworks: { floor: 2, x: 7 },
};

/** A new tutorial room starts this full, so its first batch comes quickly. */
const PREFILL = 0.85;

/** The tutorial is running (a tutorial homestead that hasn't finished or skipped it). */
export function tutorialActive(state: GameState): boolean {
  return !!state.tutorial && !state.tutorial.done;
}

export function tutorialStep(state: GameState): TutorialStep | null {
  return tutorialActive(state) ? (state.tutorial?.step ?? null) : null;
}

/** The room type a build or staff step is about, if any. */
export function tutorialRoom(step: TutorialStep | null): string | null {
  switch (step) {
    case 'build_power':
    case 'staff_power':
      return TUTORIAL_ROOMS.power;
    case 'build_water':
    case 'staff_water':
      return TUTORIAL_ROOMS.water;
    case 'build_food':
    case 'staff_food':
      return TUTORIAL_ROOMS.food;
    default:
      return null;
  }
}

/** Building this room type costs nothing right now (its tutorial build step is active). */
export function tutorialFreeBuild(state: GameState, type: string): boolean {
  const step = tutorialStep(state);
  return !!step && step.startsWith('build_') && tutorialRoom(step) === type;
}

const isCore = (type: string): boolean => (Object.values(TUTORIAL_ROOMS) as string[]).includes(type);

/**
 * A room was just built in a tutorial homestead. The first of each core type
 * comes stocked (the resource starts at the usual starting amount, which the
 * empty start had nowhere to store) and nearly through its first batch.
 */
export function onTutorialBuild(state: GameState, content: Content, room: Room): void {
  if (!tutorialActive(state) || !isCore(room.type)) return;
  if (state.rooms.some((r) => r.type === room.type && r.id !== room.id)) return;
  const def = roomDef(content, room);
  const key = def.produces?.resource;
  if (!key) return;
  const start = content.balance.start.resources[key] ?? 0;
  state.resources[key] = Math.max(state.resources[key], start);
  room.pool = Math.max(room.pool, def.produces ? def.produces.poolBase * room.segments * PREFILL : 0);
}

function staffed(state: GameState, type: string): boolean {
  const ids = new Set(state.rooms.filter((r) => r.type === type).map((r) => r.id));
  return state.residents.some((r) => !r.dead && r.roomId !== null && ids.has(r.roomId));
}

/** Is this step's goal met? */
function stepDone(state: GameState, step: TutorialStep): boolean {
  switch (step) {
    case 'admit':
      return state.residents.some((r) => !r.waiting);
    case 'build_power':
    case 'build_water':
    case 'build_food':
      return state.rooms.some((r) => r.type === tutorialRoom(step));
    case 'staff_power':
    case 'staff_water':
    case 'staff_food':
      return staffed(state, tutorialRoom(step) as string);
    case 'collect':
      return (state.stats['collections'] ?? 0) > 0;
    case 'crate':
      return (state.stats['cratesOpened'] ?? 0) > 0 || state.crates.standard + state.crates.rare + state.crates.legendary === 0;
    case 'equip':
      // Nothing to equip (the crate held none, or it was sold) counts as done.
      return (state.stats['equips'] ?? 0) > 0 || state.items.length === 0;
    case 'done':
      return true;
  }
}

/** Move the tutorial on past every step whose goal is met. Call after commands and ticks. */
export function tickTutorial(state: GameState): void {
  const t = state.tutorial;
  if (!t || t.done) return;
  let i = TUTORIAL_STEPS.indexOf(t.step);
  if (i < 0) i = 0;
  const from = t.step;
  while (i < TUTORIAL_STEPS.length - 1 && stepDone(state, TUTORIAL_STEPS[i] as TutorialStep)) i++;
  const step = TUTORIAL_STEPS[i] as TutorialStep;
  if (step === from) return;
  t.step = step;
  if (step === 'done') t.done = true;
  state.events.push({ type: 'tutorialStep', step, skipped: false });
}

/** First free, valid slot for a room on the starter floors, preferring the classic spot. */
function freeSlot(state: GameState, content: Content, type: string): { floor: number; x: number } | null {
  const classic = CLASSIC_SPOT[type];
  if (classic && canPlace(state, content, type, classic.floor, classic.x).ok) return classic;
  const cells = content.balance.grid.cellsPerFloor;
  const floors = Math.max(1, ...state.rooms.filter((r) => r.type === 'elevator').map((r) => r.floor + 1));
  for (let floor = 0; floor < floors; floor++) {
    for (let x = 0; x < cells; x++) if (canPlace(state, content, type, floor, x).ok) return { floor, x };
  }
  return null;
}

/**
 * Skip the tutorial: finish it and, so the homestead is never left without the
 * basics, build (free) any of the three core rooms not built yet.
 */
export function skipTutorial(state: GameState, content: Content): string | null {
  if (!tutorialActive(state)) return 'the tutorial is already over';
  for (const type of [TUTORIAL_ROOMS.power, TUTORIAL_ROOMS.food, TUTORIAL_ROOMS.water]) {
    if (state.rooms.some((r) => r.type === type)) continue;
    const at = freeSlot(state, content, type);
    if (!at) continue;
    const room: Room = { id: state.nextId++, type, floor: at.floor, x: at.x, segments: 1, level: 1, pool: 0, ready: false, powered: true, timer: 0, job: null, banked: 0 };
    state.rooms.push(room);
    onTutorialBuild(state, content, room);
    bump(state, 'roomsBuilt');
    state.events.push({ type: 'roomBuilt', roomId: room.id, roomType: type });
  }
  const t = state.tutorial;
  if (t) {
    t.step = 'done';
    t.done = true;
  }
  state.events.push({ type: 'tutorialStep', step: 'done', skipped: true });
  return null;
}
