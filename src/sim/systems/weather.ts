// Surface weather (GDD §6.4): topside buildings are exposed to dust storms,
// taint storms and heatwaves. Weather shifts production up top and can hurt
// residents working there.
//
// CONTRACT (M7, stream A). Keep these signatures; see docs/design/M7-spec.md.

import type { Content } from '../content';
import type { GameState, Room, WeatherKind } from '../types';

export interface WeatherKindDef {
  name: string;
  weight: number;
  minutes: [number, number];
  /** Output multiplier for topside production rooms. */
  production: number;
  /** Taint per minute for residents working topside. */
  taintPerMin?: number;
}

export interface TopsideContent {
  weather: { kinds: Record<WeatherKind, WeatherKindDef> };
}

export function topsideContent(content: Content): TopsideContent {
  return content.topside as unknown as TopsideContent;
}

export function isTopside(room: Room): boolean {
  return room.floor < 0;
}

/** Production multiplier for a room from the weather (1 below ground). */
export function weatherMult(state: GameState, content: Content, room: Room): number {
  void state;
  void content;
  void room;
  return 1; // stream A
}

/** Weather changes over time (online and offline); storms hurt topside workers (online only). */
export function tickWeather(state: GameState, content: Content, dt: number, offline: boolean): void {
  void state;
  void content;
  void dt;
  void offline;
}
