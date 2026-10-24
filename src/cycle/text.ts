/**
 * Plain-language strings built from predictions (pure, tested).
 */
import type { CyclePredictions } from '../health/cyclePrediction';
import { diffDays, formatDay, type DayKey } from '../health/dates';
import type { CycleGoal } from './store';

export const shortDay = (k: DayKey) => formatDay(k, { day: 'numeric', month: 'short' });

/** "Next period in about 5 days · 12 Nov", or a range when cycles are irregular. */
export function nextPeriodText(p: CyclePredictions, today: DayKey): string {
  const n = p.upcoming[0];
  if (!n) return 'Log a period to see the next one';
  if (p.daysLate > 0 && !p.irregular) return 'Period expected any day now';
  if (n.earliest !== n.latest) {
    if (n.earliest <= today) return `Period could start any day, up to ${shortDay(n.latest)}`;
    return `Next period between ${shortDay(n.earliest)} and ${shortDay(n.latest)}`;
  }
  const until = diffDays(today, n.start);
  if (until <= 0) return 'Period may start today';
  if (until === 1) return `Next period tomorrow · ${shortDay(n.start)}`;
  return `Next period in about ${until} days · ${shortDay(n.start)}`;
}

/** The fertile window that is current or next, worded for the user's goal. */
export function fertileText(p: CyclePredictions, goal: CycleGoal, today: DayKey): string | null {
  const w = p.upcoming.find((u) => u.fertileEnd >= today && !(p.daysLate > 0 && u.index === 1));
  if (!w) return null;
  const name = goal === 'avoid' ? 'Higher-chance days' : 'Fertile window';
  const range = `${shortDay(w.fertileStart)} – ${shortDay(w.fertileEnd)}`;
  const ov =
    w.ovulationEarliest === w.ovulationLatest
      ? `ovulation around ${shortDay(w.ovulation)}`
      : `ovulation between ${shortDay(w.ovulationEarliest)} and ${shortDay(w.ovulationLatest)}`;
  if (w.fertileStart <= today) return `${name} now, until ${shortDay(w.fertileEnd)} (${ov})`;
  return `${name}: ${range} (${ov})`;
}

export function upcomingRows(p: CyclePredictions): { key: string; label: string; a11y: string }[] {
  return p.upcoming.map((u) => {
    const label =
      u.earliest === u.latest ? shortDay(u.start) : `${shortDay(u.earliest)} – ${shortDay(u.latest)}`;
    return {
      key: u.start,
      label,
      a11y: u.earliest === u.latest ? `Period ${u.index}: around ${label}` : `Period ${u.index}: between ${shortDay(u.earliest)} and ${shortDay(u.latest)}`,
    };
  });
}
