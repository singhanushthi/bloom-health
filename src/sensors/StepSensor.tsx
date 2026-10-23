/**
 * Runs the foreground step counter while Bloom is open (live mode, steps tracked, permission
 * granted) and exposes the ACTIVITY_RECOGNITION permission state to the UI.
 * Listeners are notified after each flush so only the activity card re-reads — not every metric.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../state/AppState';
import {
  getSensorPermission,
  requestSensorPermission,
  startForegroundCounting,
  type SensorPermission,
} from './stepCounter';

interface StepSensorValue {
  permission: SensorPermission | 'checking';
  request: () => Promise<SensorPermission>;
  /** Subscribe to "steps were saved" events. Returns an unsubscribe function. */
  onSaved: (fn: () => void) => () => void;
}

const Ctx = createContext<StepSensorValue | null>(null);

export function StepSensorProvider({ children }: { children: React.ReactNode }) {
  const { demoMode, tracks, ready } = useAppState();
  const [permission, setPermission] = useState<SensorPermission | 'checking'>('checking');
  const listeners = useRef(new Set<() => void>());

  useEffect(() => {
    getSensorPermission().then(setPermission).catch(() => setPermission('unavailable'));
  }, []);

  const active = ready && !demoMode && tracks.includes('steps') && permission === 'granted';
  useEffect(() => {
    if (!active) return;
    return startForegroundCounting(() => listeners.current.forEach((fn) => fn()));
  }, [active]);

  const request = useCallback(async () => {
    const p = await requestSensorPermission();
    setPermission(p);
    return p;
  }, []);

  const onSaved = useCallback((fn: () => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const value = useMemo(() => ({ permission, request, onSaved }), [permission, request, onSaved]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStepSensor(): StepSensorValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStepSensor must be used inside StepSensorProvider');
  return v;
}
