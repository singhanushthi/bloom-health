import { useEffect, useSyncExternalStore } from 'react';
import { getWatchState, initWatch, subscribeWatch, type WatchState } from './controller';

/** Live direct-watch state. Initialises the (lazy) Bluetooth layer on first use. */
export function useWatch(): WatchState {
  const s = useSyncExternalStore(subscribeWatch, getWatchState, getWatchState);
  useEffect(() => {
    void initWatch();
  }, []);
  return s;
}
