import { useEffect, useSyncExternalStore } from 'react';
import { getWatchState, initWatch, initWatchIfPaired, subscribeWatch, type WatchState } from './controller';

/**
 * Live direct-watch state. By default initialises the (lazy) Bluetooth layer on first use.
 * Pass `{ bluetooth: false }` for passive UI (e.g. the Today chip): Bluetooth is only touched
 * when a watch was paired before.
 */
export function useWatch(opts: { bluetooth?: boolean } = {}): WatchState {
  const bluetooth = opts.bluetooth ?? true;
  const s = useSyncExternalStore(subscribeWatch, getWatchState, getWatchState);
  useEffect(() => {
    void (bluetooth ? initWatch() : initWatchIfPaired());
  }, [bluetooth]);
  return s;
}
