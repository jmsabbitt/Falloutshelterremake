// HALCY's tutorial coach: a small bubble under the HUD with the current step's
// one-line instruction and a way to skip. It never blocks the homestead: the
// steps themselves live in the sim (state.tutorial) and move on as the Warden
// plays, so this only says what to do next and points at the right control.

import {
  effectiveStats,
  isAway,
  isChild,
  roomDef,
  topStats,
  TUTORIAL_STEPS,
  tutorialRoom,
  tutorialStep,
  type GameEvent,
  type TutorialStep,
} from '../../sim';
import type { Game } from '../game';
import type { VaultView } from '../render/vaultView';
import { ask } from './confirm';
import { h } from './dom';
import { halcyFace, type HalcyMood } from './halcy';
import { isPhone } from './layout';
import { nameList, STAT_FULL } from './qolText';

export interface CoachHost {
  game: Game;
  view: VaultView;
  /** The open panel ('build', 'crates', ...), or null. */
  panel(): string | null;
  /** Open the Build panel with this room picked (green slots showing). */
  openBuild(type: string): void;
  /** Leave build mode and close the panel. */
  endBuild(): void;
  toast(text: string, kind?: 'good' | 'bad'): void;
  /** Glide the camera so this room is clear of the HUD, the bubble and any sheet (`above`: px of headroom to keep over it). */
  reveal(roomId: number, above: number): void;
}

interface Line {
  text: string;
  mood: HalcyMood;
  /** One button beside Skip (the closing line's "Build Quarters"). */
  action?: { label: string; run: () => void };
}

/** Steps the Warden sees counted ("3 of 10"). */
const COUNTED: readonly TutorialStep[] = TUTORIAL_STEPS.filter((s) => s !== 'done');

export class TutorialCoach {
  readonly el = h('div', { class: 'coach', role: 'status', 'aria-live': 'polite', hidden: true });
  /** The line shown after the last step (or a skip) until the Warden closes it. */
  private closing: Line | null = null;
  private key = '';
  /** The step whose rooms were last brought into view. */
  private shown: TutorialStep | null = null;

  constructor(private host: CoachHost) {
    // Toasts move down below the bubble (style.css), so they need its height.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => document.documentElement.style.setProperty('--coach-h', `${Math.round(this.el.getBoundingClientRect().height)}px`)).observe(this.el);
    }
  }

  /** A step is running: the build list and the toolbar take their cues from it. */
  active(): boolean {
    return tutorialStep(this.host.game.state) !== null;
  }

  /** The room type the Build panel should lead with right now. */
  buildTarget(): string | null {
    const step = tutorialStep(this.host.game.state);
    return step?.startsWith('build_') ? tutorialRoom(step) : null;
  }

  /** The bubble is showing (for the camera insets). */
  visible(): boolean {
    return !this.el.hidden;
  }

  onEvents(events: GameEvent[]): void {
    for (const ev of events) {
      if (ev.type !== 'tutorialStep') continue;
      // Built the step's room: leave build mode so the next thing to do (drag someone in) is in reach.
      if (ev.step.startsWith('staff_') || (ev.skipped && this.host.panel() === 'build')) this.host.endBuild();
      if (ev.step === 'done') this.closing = ev.skipped ? this.skippedLine() : this.doneLine();
    }
  }

  onStateReplaced(): void {
    this.closing = null;
    this.shown = null;
    // Hide the old homestead's bubble now. (Clearing only the key left it on screen:
    // update() skips the redraw when the new key is '' too, as it is with no tutorial.)
    this.key = '';
    this.el.hidden = true;
    this.el.replaceChildren();
  }

  private doneLine(): Line {
    return {
      mood: 'wink',
      text: "That's the basics, Warden! Next, build Quarters: new arrivals need beds, and families only start there. Then explore the Glarelands, and check Goals for rewards.",
      action: { label: 'Build Quarters', run: () => ((this.closing = null), this.host.openBuild('quarters')) },
    };
  }

  private skippedLine(): Line {
    return {
      mood: 'smile',
      text: 'Tutorial skipped! I put up power, water and food for you. Drag residents into rooms that match their best stat, and build Quarters when you need more beds.',
    };
  }

  /** Founders who are best at a room's stat and free to take the job. */
  private fits(type: string): string {
    const { state, content } = this.host.game;
    const stat = content.rooms[type]?.stat;
    if (!stat) return 'a resident';
    const names = state.residents
      .filter((r) => !r.waiting && !r.dead && !isAway(r) && !isChild(state, r) && r.roomId === null && topStats(effectiveStats(content, r)).includes(stat))
      .map((r) => r.firstName);
    const who = names.length ? nameList(names, 2) : 'a resident';
    return `${who} (${STAT_FULL[stat]})`;
  }

  private line(step: TutorialStep): Line {
    const { state, content } = this.host.game;
    const type = tutorialRoom(step);
    const name = type ? (content.rooms[type]?.name ?? type) : '';
    const placing = this.host.panel() === 'build' && this.host.view.buildMode === type;
    switch (step) {
      case 'admit':
        return {
          mood: 'smile',
          text: `Welcome to Homestead ${state.homesteadNumber}, Warden! I'm HALCY, your Halcyon guide. Your founders are waiting outside: tap the door to let them in!`,
        };
      case 'build_power':
      case 'build_water':
      case 'build_food': {
        const lead = step === 'build_power' ? 'First things first: power.' : step === 'build_water' ? 'Lovely! Now water.' : 'Last one: food.';
        return placing
          ? { mood: 'talk', text: `Tap a green slot to build the ${name}, left or right of the elevator: your call! Halcyon is paying for this one.` }
          : { mood: 'talk', text: `${lead} Tap Build and place a ${name} on either side of the elevator. It's free, courtesy of Halcyon!` };
      }
      case 'staff_power':
      case 'staff_water':
      case 'staff_food':
        return { mood: 'talk', text: `Now drag ${this.fits(type as string)} into the ${name}. While you drag, rooms that match their best stat light up.` };
      case 'collect': {
        const ready = state.rooms.find((r) => r.ready);
        return ready
          ? { mood: 'smile', text: `A batch is ready! Tap the bubble over the ${roomDef(content, ready).name} to collect it.` }
          : { mood: 'talk', text: 'Your crew is hard at work. When a bubble pops up over a room, tap it to collect what they made.' };
      }
      case 'crate':
        return { mood: 'smile', text: `Halcyon sent Supply Crates to get you started. Tap ${isPhone() ? 'the 📦 chip up top' : 'Crates'} and open one!` };
      case 'equip':
        return { mood: 'wink', text: `Ooh, gear! Tap Equip on the card, or open ${isPhone() ? 'Items' : 'Storage'} and tap the item, then pick who gets it.` };
      case 'done':
        return this.doneLine();
    }
  }

  private skip(): void {
    ask(
      {
        title: 'Skip the tutorial?',
        text: "HALCY builds any of the Generator, Water Works and Canteen you haven't built yet, free, so the homestead is ready to go.",
        ok: 'Skip tutorial',
      },
      () => {
        const res = this.host.game.run({ type: 'skipTutorial' });
        if (!res.ok) this.host.toast(res.reason, 'bad');
      },
    );
  }

  /** Every frame: the bubble's text, and which controls and rooms pulse. */
  update(): void {
    const { state } = this.host.game;
    const step = tutorialStep(state);
    const line = step ? this.line(step) : this.closing;
    this.point(step);
    // A new step: bring the room it is about into view, once the bubble has been laid out.
    if (step !== this.shown && this.visible()) {
      this.shown = step;
      const first = this.host.view.coachRoomIds[0];
      if (first !== undefined) this.host.reveal(first, step === 'admit' ? 60 : 0);
    }
    const key = line ? `${step}|${line.text}|${isPhone()}` : '';
    if (key === this.key) return;
    this.key = key;
    if (!line) {
      this.el.hidden = true;
      this.el.replaceChildren();
      return;
    }
    const n = step ? COUNTED.indexOf(step) + 1 : 0;
    this.el.hidden = false;
    this.el.replaceChildren(
      halcyFace(line.mood),
      h(
        'div',
        { class: 'coach-body' },
        h(
          'div',
          { class: 'coach-head' },
          h('b', {}, 'HALCY'),
          n > 0 ? h('span', { class: 'coach-count' }, `${n} of ${COUNTED.length}`) : null,
          step ? h('button', { class: 'coach-skip', onclick: () => this.skip() }, 'Skip tutorial') : null,
        ),
        h('div', { class: 'coach-text' }, line.text),
        step
          ? null
          : h(
              'div',
              { class: 'coach-actions' },
              line.action ? h('button', { class: 'primary small-btn', onclick: line.action.run }, line.action.label) : null,
              h('button', { class: 'small-btn', onclick: () => ((this.closing = null), this.update()) }, 'Got it'),
            ),
      ),
    );
  }

  /** Pulse the control the step is about, and outline the rooms it means. */
  private point(step: TutorialStep | null): void {
    const { state } = this.host.game;
    const root = document.getElementById('ui');
    const panel = this.host.panel();
    const type = tutorialRoom(step);
    const pulse = new Set<Element>();
    const add = (sel: string) => root?.querySelectorAll(sel).forEach((el) => pulse.add(el));
    if (step?.startsWith('build_') && panel !== 'build') add('.toolbar .build-btn');
    if (step === 'crate' && panel !== 'crates') add('.toolbar button[title="Supply Crates"], .hud .crate-chip');
    if (step === 'equip' && panel !== 'storage' && !root?.querySelector('.crate-modal')) add('.toolbar .storage-btn');
    root?.querySelectorAll('.tut-pulse').forEach((el) => {
      if (!pulse.has(el) && !el.classList.contains('build-item')) el.classList.remove('tut-pulse');
    });
    for (const el of pulse) el.classList.add('tut-pulse');

    let rooms: number[] = [];
    if (step === 'admit') rooms = state.rooms.filter((r) => r.type === 'door').map((r) => r.id);
    else if (step?.startsWith('staff_')) rooms = state.rooms.filter((r) => r.type === type).map((r) => r.id);
    else if (step === 'collect') rooms = state.rooms.filter((r) => r.ready).map((r) => r.id);
    this.host.view.coachRoomIds = rooms;
  }
}
