/**
 * Change signal for Kitchen data (pantry, shopping list, my recipes). Same pattern as
 * src/plan/events.ts: writers call emitKitchenChange(); screens re-read on useKitchenVersion().
 */
import { useEffect, useState } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export function emitKitchenChange(): void {
  version += 1;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // a broken listener must not block the others
    }
  });
}

export function subscribeKitchen(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useKitchenVersion(): number {
  const [v, setV] = useState(version);
  useEffect(() => subscribeKitchen(() => setV(version)), []);
  return v;
}
