/**
 * All logging sheets + a provider so any screen can open them:
 *   const { open } = useLogSheets(); open('period') / open('day', { day }) / open('sleep') / open('reading') / open('steps')
 *
 * Every save writes to SQLite (src/db/repos) and bumps AppState.dataVersion so screens re-read.
 * Validation errors are shown inline under the field that caused them.
 */
import { router } from 'expo-router';
import { Activity, CalendarHeart, Droplet, HeartPulse, Moon, NotebookPen, Footprints, Scale, Utensils } from 'lucide-react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  FLOWS,
  HR_RANGE,
  periods,
  sleepLogs,
  SPO2_RANGE,
  stepDays,
  ValidationError,
  vitals,
  type Flow,
  type VitalKind,
} from '../../db/repos';
import { dayStart, toDayKey, todayKey, type DayKey } from '../../health/dates';
import { CycleDayLogSheet } from '../../cycle/DayLogSheet';
import { useAppState } from '../../state/AppState';
import { radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { Button, Text } from '../ui';
import { DateTimeField, sleepRange, withTime } from './DateTimeField';
import { ChipRow, Field, Input, Sheet, ToggleChip } from './Sheet';

export type SheetKind = 'menu' | 'period' | 'day' | 'sleep' | 'reading' | 'steps';
interface OpenOpts {
  day?: DayKey;
  kind?: VitalKind;
}

interface LogSheetsValue {
  open: (k: SheetKind, opts?: OpenOpts) => void;
}

const Ctx = createContext<LogSheetsValue | null>(null);

export function useLogSheets(): LogSheetsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLogSheets must be used inside LogSheetsProvider');
  return v;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function errMsg(e: unknown, field: string): string | null {
  if (e instanceof ValidationError) return e.field === field ? e.message : null;
  return null;
}

export function LogSheetsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ kind: SheetKind | null; opts: OpenOpts }>({ kind: null, opts: {} });
  const open = useCallback((kind: SheetKind, opts: OpenOpts = {}) => setState({ kind, opts }), []);
  const close = useCallback(() => setState((s) => ({ ...s, kind: null })), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <LogMenuSheet
        visible={state.kind === 'menu'}
        onClose={close}
        onPick={(k) => open(k)}
        onRoute={(href) => {
          close();
          router.push(href);
        }}
      />
      {state.kind === 'period' ? <PeriodSheet onClose={close} /> : null}
      {state.kind === 'day' ? <CycleDayLogSheet onClose={close} day={state.opts.day ?? todayKey()} /> : null}
      {state.kind === 'sleep' ? <SleepSheet onClose={close} /> : null}
      {state.kind === 'reading' ? <ReadingSheet onClose={close} initialKind={state.opts.kind ?? 'hr'} /> : null}
      {state.kind === 'steps' ? <StepsSheet onClose={close} /> : null}
    </Ctx.Provider>
  );
}

/* ------------------------------ Action menu ------------------------------ */

function LogMenuSheet({
  visible,
  onClose,
  onPick,
  onRoute,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (k: SheetKind) => void;
  onRoute: (href: string) => void;
}) {
  const { c } = useTheme();
  // Plan logging lives on its own screens (src/app/weight, food, activity).
  const items: { k: SheetKind | string; route?: string; label: string; hint: string; icon: typeof Droplet; accent: string; soft: string }[] = [
    { k: 'weight', route: '/weight', label: 'Weight', hint: 'Morning or night weight in kg', icon: Scale, accent: c.spo2, soft: c.spo2Soft },
    { k: 'food', route: '/food/add', label: 'Food', hint: 'Search, recent, favourites or AI quick add', icon: Utensils, accent: c.steps, soft: c.stepsSoft },
    { k: 'activity', route: '/activity/add', label: 'Activity', hint: 'What you did today — walk, yoga, gym…', icon: Activity, accent: c.heart, soft: c.heartSoft },
    { k: 'period', label: 'Period', hint: 'Start date, end date and flow', icon: Droplet, accent: c.cycle, soft: c.cycleSoft },
    { k: 'day', label: 'Day log', hint: 'Flow, symptoms, mood, pain, energy, pills and a note', icon: NotebookPen, accent: c.cycle, soft: c.cycleSoft },
    { k: 'sleep', label: 'Sleep', hint: 'Bedtime, wake time and quality', icon: Moon, accent: c.sleep, soft: c.sleepSoft },
    { k: 'reading', label: 'Reading', hint: 'Heart rate or blood oxygen (SpO₂)', icon: HeartPulse, accent: c.heart, soft: c.heartSoft },
  ];
  return (
    <Sheet visible={visible} title="Log" onClose={onClose}>
      <View style={{ gap: space.xs }}>
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Pressable
              key={it.k}
              onPress={() => (it.route ? onRoute(it.route) : onPick(it.k as SheetKind))}
              accessibilityRole="button"
              accessibilityLabel={it.label}
              accessibilityHint={it.hint}
              android_ripple={{ color: c.line }}
              style={({ pressed }) => ({
                minHeight: 64,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                padding: space.sm,
                borderRadius: radius.chip,
                backgroundColor: c.surface,
                borderWidth: 1,
                borderColor: c.line,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: it.soft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={20} color={it.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{it.label}</Text>
                <Text variant="caption" tone="muted">
                  {it.hint}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/* --------------------------------- Period -------------------------------- */

function PeriodSheet({ onClose }: { onClose: () => void }) {
  const { c } = useTheme();
  const { bump } = useAppState();
  const now = new Date();
  const [start, setStart] = useState(now);
  const [hasEnd, setHasEnd] = useState(false);
  const [end, setEnd] = useState(now);
  const [flow, setFlow] = useState<Flow | null>('medium');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const startDay = toDayKey(start);
      const endDay = hasEnd ? toDayKey(end) : null;
      if (startDay > todayKey()) throw new ValidationError('startDay', 'Start date can’t be in the future.');
      await periods.add({ startDay, endDay, flow });
      bump();
      onClose();
    } catch (e) {
      setError(e instanceof ValidationError ? e : new ValidationError('form', 'Couldn’t save. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title="Log period"
      onClose={onClose}
      footer={<Button label="Save period" onPress={save} loading={busy} />}
    >
      <Field label="Start date" error={errMsg(error, 'startDay')}>
        <DateTimeField label="Start date" mode="date" value={start} onChange={setStart} maximumDate={now} error={!!errMsg(error, 'startDay')} />
      </Field>
      <Field label="End date (optional)" error={errMsg(error, 'endDay')} hint={hasEnd ? undefined : 'Leave open if your period is still going.'}>
        <ChipRow label="End date">
          <ToggleChip label="Still going" role="radio" selected={!hasEnd} onPress={() => setHasEnd(false)} accent={c.cycle} soft={c.cycleSoft} />
          <ToggleChip label="Ended" role="radio" selected={hasEnd} onPress={() => setHasEnd(true)} accent={c.cycle} soft={c.cycleSoft} />
        </ChipRow>
        {hasEnd ? (
          <DateTimeField label="End date" mode="date" value={end} onChange={setEnd} minimumDate={start} maximumDate={now} error={!!errMsg(error, 'endDay')} />
        ) : null}
      </Field>
      <Field label="Flow">
        <ChipRow label="Flow">
          {FLOWS.map((f) => (
            <ToggleChip key={f} label={cap(f)} role="radio" selected={flow === f} onPress={() => setFlow(flow === f ? null : f)} accent={c.cycle} soft={c.cycleSoft} />
          ))}
        </ChipRow>
      </Field>
      {errMsg(error, 'form') ? <Text tone="danger">{errMsg(error, 'form')}</Text> : null}
      <Text variant="caption" tone="muted">
        Saved only on this phone. Predictions are estimates, not contraception advice.
      </Text>
    </Sheet>
  );
}

/* --------------------------------- Sleep --------------------------------- */

function SleepSheet({ onClose }: { onClose: () => void }) {
  const { c } = useTheme();
  const { bump } = useAppState();
  const now = new Date();
  // Defaults: 11 pm yesterday → 7 am today.
  const defBed = new Date(dayStart(todayKey(now)).getTime() - 60 * 60_000);
  const defWake = new Date(dayStart(todayKey(now)).getTime() + 7 * 60 * 60_000);
  const [bedDay, setBedDay] = useState(defBed);
  const [bedTime, setBedTime] = useState(defBed);
  const [wakeDay, setWakeDay] = useState(defWake > now ? now : defWake);
  const [wakeTime, setWakeTime] = useState(defWake > now ? now : defWake);
  const [quality, setQuality] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await sleepLogs.add({ ...sleepRange(bedDay, bedTime, wakeDay, wakeTime), quality });
      bump();
      onClose();
    } catch (e) {
      setError(e instanceof ValidationError ? e : new ValidationError('form', 'Couldn’t save. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const QUALITY = ['Very poor', 'Poor', 'OK', 'Good', 'Great'];

  return (
    <Sheet visible title="Log sleep" onClose={onClose} footer={<Button label="Save sleep" onPress={save} loading={busy} />}>
      <Field label="Bedtime">
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          <View style={{ flex: 1.4 }}>
            <DateTimeField label="Bedtime date" mode="date" value={bedDay} onChange={setBedDay} maximumDate={now} />
          </View>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Bedtime" mode="time" value={bedTime} onChange={setBedTime} />
          </View>
        </View>
      </Field>
      <Field label="Wake time" error={errMsg(error, 'end')}>
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          <View style={{ flex: 1.4 }}>
            <DateTimeField label="Wake date" mode="date" value={wakeDay} onChange={setWakeDay} maximumDate={now} error={!!errMsg(error, 'end')} />
          </View>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Wake time" mode="time" value={wakeTime} onChange={setWakeTime} error={!!errMsg(error, 'end')} />
          </View>
        </View>
      </Field>
      <Field label="How well did you sleep? (optional)" error={errMsg(error, 'quality')}>
        <ChipRow label="Sleep quality">
          {QUALITY.map((q, i) => (
            <ToggleChip
              key={q}
              label={`${i + 1} · ${q}`}
              role="radio"
              selected={quality === i + 1}
              onPress={() => setQuality(quality === i + 1 ? null : i + 1)}
              accent={c.sleep}
              soft={c.sleepSoft}
            />
          ))}
        </ChipRow>
      </Field>
      {errMsg(error, 'form') ? <Text tone="danger">{errMsg(error, 'form')}</Text> : null}
    </Sheet>
  );
}

/* -------------------------------- Reading -------------------------------- */

function ReadingSheet({ onClose, initialKind }: { onClose: () => void; initialKind: VitalKind }) {
  const { c } = useTheme();
  const { bump } = useAppState();
  const now = new Date();
  const [kind, setKind] = useState<VitalKind>(initialKind);
  const [raw, setRaw] = useState('');
  const [day, setDay] = useState(now);
  const [time, setTime] = useState(now);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const range = kind === 'hr' ? HR_RANGE : SPO2_RANGE;
  const unit = kind === 'hr' ? 'bpm' : '%';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const trimmed = raw.trim();
      if (!trimmed) throw new ValidationError('value', 'Enter a number.');
      const value = Number(trimmed.replace(',', '.'));
      await vitals.add({ kind, value, time: withTime(day, time) });
      bump();
      onClose();
    } catch (e) {
      setError(e instanceof ValidationError ? e : new ValidationError('form', 'Couldn’t save. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible title="Add reading" onClose={onClose} footer={<Button label="Save reading" onPress={save} loading={busy} />}>
      <Field label="Type">
        <ChipRow label="Reading type">
          <ToggleChip label="Heart rate" role="radio" selected={kind === 'hr'} onPress={() => { setKind('hr'); setError(null); }} accent={c.heart} soft={c.heartSoft} />
          <ToggleChip label="Blood oxygen (SpO₂)" role="radio" selected={kind === 'spo2'} onPress={() => { setKind('spo2'); setError(null); }} accent={c.spo2} soft={c.spo2Soft} />
        </ChipRow>
      </Field>
      <Field
        label={kind === 'hr' ? 'Heart rate (bpm)' : 'SpO₂ (%)'}
        error={errMsg(error, 'value')}
        hint={`Between ${range.min} and ${range.max} ${unit}.`}
      >
        <Input
          value={raw}
          onChangeText={(t) => {
            setRaw(t);
            if (error) setError(null);
          }}
          keyboardType="number-pad"
          maxLength={3}
          error={!!errMsg(error, 'value')}
          accessibilityLabel={kind === 'hr' ? 'Heart rate in beats per minute' : 'Blood oxygen percent'}
          accessibilityHint={`Between ${range.min} and ${range.max}`}
        />
      </Field>
      <Field label="When" error={errMsg(error, 'time')}>
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          <View style={{ flex: 1.4 }}>
            <DateTimeField label="Reading date" mode="date" value={day} onChange={setDay} maximumDate={now} />
          </View>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Reading time" mode="time" value={time} onChange={setTime} error={!!errMsg(error, 'time')} />
          </View>
        </View>
      </Field>
      {errMsg(error, 'form') ? <Text tone="danger">{errMsg(error, 'form')}</Text> : null}
      <Text variant="caption" tone="muted">
        From a pulse oximeter, blood-pressure cuff or your watch screen. Bloom doesn’t measure these with the camera.
      </Text>
    </Sheet>
  );
}

/* --------------------------------- Steps --------------------------------- */

function StepsSheet({ onClose }: { onClose: () => void }) {
  const { bump } = useAppState();
  const today = todayKey();
  const [raw, setRaw] = useState('');
  const [hasManual, setHasManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    stepDays
      .get(today)
      .then((s) => {
        if (s?.manualSteps != null) {
          setRaw(String(s.manualSteps));
          setHasManual(true);
        } else if (s) setRaw(String(s.sensorSteps || ''));
      })
      .catch(() => {});
  }, [today]);

  const save = async (value: number | null) => {
    setBusy(true);
    setError(null);
    try {
      await stepDays.setManual(today, value);
      bump();
      onClose();
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : 'Couldn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onSave = () => {
    const t = raw.replace(/[^0-9]/g, '');
    if (!t) {
      setError('Enter a number of steps.');
      return;
    }
    save(Number(t));
  };

  return (
    <Sheet
      visible
      title="Edit today’s steps"
      onClose={onClose}
      footer={
        <>
          <Button label="Save steps" onPress={onSave} loading={busy} icon={Footprints} />
          {hasManual ? <Button label="Use automatic count" variant="ghost" onPress={() => save(null)} /> : null}
        </>
      }
    >
      <Field label="Steps today" error={error} hint="Your number replaces the automatic count for today.">
        <Input
          value={raw}
          onChangeText={(t) => {
            setRaw(t);
            setError(null);
          }}
          keyboardType="number-pad"
          maxLength={6}
          error={!!error}
          accessibilityLabel="Steps today"
        />
      </Field>
    </Sheet>
  );
}

/* --------------------------- Floating Log button -------------------------- */

export function LogFab({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const { c } = useTheme();
  const { open } = useLogSheets();
  return (
    <Pressable
      onPress={() => open('menu')}
      accessibilityRole="button"
      accessibilityLabel="Log"
      accessibilityHint="Log weight, food, activity, a period, day, sleep or reading"
      android_ripple={{ color: '#ffffff33', borderless: false }}
      style={({ pressed }) => ({
        position: 'absolute',
        right: space.md,
        bottom: space.md + bottomOffset,
        minHeight: 56,
        minWidth: touch.min,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        backgroundColor: c.ink,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        elevation: 6,
        shadowColor: c.shadow,
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        overflow: 'hidden',
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <CalendarHeart size={22} color={c.onInk} />
      <Text variant="bodyStrong" tone="onInk">
        Log
      </Text>
    </Pressable>
  );
}
