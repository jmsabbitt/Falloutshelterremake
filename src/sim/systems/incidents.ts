// Incidents. For M1 only fire exists (from failed rushes). Combat follows the
// original's model: two HP pools trading damage over time (research 03 §1.6).

import type { Content } from '../content';
import { bump, grantXp, livingResidents, residentsInRoom } from '../residents';
import type { GameState, Incident, Room } from '../types';

function averageLevel(state: GameState): number {
  const living = livingResidents(state);
  if (!living.length) return 1;
  return living.reduce((s, r) => s + r.level, 0) / living.length;
}

export function startFire(state: GameState, content: Content, room: Room): Incident {
  const f = content.balance.fire;
  const hp =
    f.hpPerSegment * room.segments * (1 + f.hpPerRoomLevel * (room.level - 1)) * (1 + f.hpPerAvgLevel * (averageLevel(state) - 1));
  const incident: Incident = {
    id: state.nextId++,
    type: 'fire',
    roomId: room.id,
    hp,
    maxHp: hp,
    dps: f.dpsPerSegment * room.segments * (1 + f.hpPerAvgLevel * (averageLevel(state) - 1)),
  };
  state.incidents.push(incident);
  state.events.push({ type: 'incidentStarted', incidentId: incident.id, roomId: room.id, incident: 'fire' });
  return incident;
}

export function tickIncidents(state: GameState, content: Content, dt: number): void {
  const f = content.balance.fire;
  for (const inc of [...state.incidents]) {
    const room = state.rooms.find((r) => r.id === inc.roomId);
    if (!room) {
      state.incidents = state.incidents.filter((i) => i !== inc);
      continue;
    }
    const crew = residentsInRoom(state, room.id);
    // Empty rooms burn on (spreading arrives with M2).
    if (crew.length === 0) continue;

    inc.hp -= crew.length * f.damagePerResidentPerSec * dt;
    const perResident = (inc.dps * dt) / crew.length;
    for (const r of crew) {
      r.hp -= perResident;
      if (r.hp <= 0) {
        r.hp = 0;
        r.dead = true;
        bump(state, 'deaths');
        state.events.push({ type: 'residentDied', residentId: r.id });
      }
    }

    if (inc.hp <= 0) {
      state.incidents = state.incidents.filter((i) => i !== inc);
      for (const r of residentsInRoom(state, room.id)) grantXp(state, content, r, f.xpOnResolvePerResident);
      bump(state, `incidentsResolved.${inc.type}`);
      state.events.push({ type: 'incidentResolved', incidentId: inc.id, roomId: room.id, incident: inc.type });
    }
  }
}
