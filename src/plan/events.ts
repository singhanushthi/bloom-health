/**
 * Tiny change signal for plan data (weight, food, water, activity, profile).
 * Writers call emitPlanChange(); screens subscribe with usePlanVersion() and re-read.
 * This also catches writes made outside the Plan screens (e.g. a finished yoga session).
 */
import { useEffect, useState } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export function emitPlanChange(): void {
  version += 1;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // a broken listener must not block the others
    }
  });
}

export function subscribePlan(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function usePlanVersion(): number {
  const [v, setV] = useState(version);
  useEffect(() => subscribePlan(() => setV(version)), []);
  return v;
}
