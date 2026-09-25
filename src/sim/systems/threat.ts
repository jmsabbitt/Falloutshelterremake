// The Threat Rating (GDD §7.2): one visible number for how dangerous
// incidents are right now, and why. It reads the same factors the incident
// system uses (average level, site, depth, defensive research), so players can
// see that levelling raises the stakes and that defense research lowers them.
// M9: the Mauler meter shows here too (a factor once it is rising, plus
// `mauler` for the gauge).

import type { Content } from '../content';
import { bonus, incidentRate } from '../bonuses';
import { livingResidents } from '../residents';
import type { GameState } from '../types';
import { braced, deepContent } from './deep';
import { maulerStatus, maulerTuning, type MaulerStatus } from './incidents';

export interface ThreatFactor {
  label: string;
  /** Multiplier on danger (above 1 raises it, below 1 lowers it). */
  mult: number;
}

export interface ThreatRating {
  /** 0–100; roughly how hard an incident hits compared with a veteran late-game homestead. */
  score: number;
  label: 'Calm' | 'Guarded' | 'Elevated' | 'High' | 'Severe';
  factors: ThreatFactor[];
  /** M9: the Mauler meter (0..1) and whether it is climbing. */
  mauler: MaulerStatus;
}

const LABELS: [number, ThreatRating['label']][] = [
  [20, 'Calm'],
  [40, 'Guarded'],
  [60, 'Elevated'],
  [80, 'High'],
  [Infinity, 'Severe'],
];

export function threatRating(state: GameState, content: Content): ThreatRating {
  const living = livingResidents(state);
  const avgLevel = living.length ? living.reduce((s, r) => s + r.level, 0) / living.length : 1;
  const levelMult = 1 + content.balance.incidents.hpPerAvgLevel * (avgLevel - 1);
  const factors: ThreatFactor[] = [{ label: `Average level ${avgLevel.toFixed(1)}`, mult: levelMult }];
  const rate = incidentRate(state, content);
  if (rate !== 1) factors.push({ label: 'Site', mult: rate });
  if (state.deep.strata > 0) {
    const t = deepContent(content).tuning.incidents;
    const depth = 1 + t.perStratum * Math.max(0, state.deep.strata - 1);
    factors.push({ label: `Deep strata open (${state.deep.strata})`, mult: 1 + (depth - 1) / 2 + 0.1 });
    if (braced(state, content)) factors.push({ label: 'Deep Bracing', mult: t.bracing.dpsMult });
  }
  const defense = bonus(state, content, 'incidentDefense');
  if (defense > 0) factors.push({ label: 'Defense research', mult: Math.max(0.2, 1 - defense) });
  const mauler = maulerStatus(state, content);
  if (!mauler.dormant && mauler.meter > 0) {
    factors.push({ label: `Mauler meter ${Math.round(mauler.meter * 100)}%`, mult: 1 + maulerTuning(content).threatMult * mauler.meter });
  }
  const total = factors.reduce((a, f) => a * f.mult, 1);
  // A level-40 homestead on a standard site with no defenses scores about 100.
  const ceiling = 1 + content.balance.incidents.hpPerAvgLevel * 39;
  const score = Math.max(0, Math.min(100, Math.round(((total - 1) / (ceiling - 1)) * 100)));
  const label = (LABELS.find(([cap]) => score < cap) ?? LABELS[LABELS.length - 1]!)[1];
  return { score, label, factors, mauler };
}
