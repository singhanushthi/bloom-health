/**
 * Add or edit a period logged in Bloom (start, end or "still going", flow) and delete it.
 */
import { Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { DateTimeField } from '../components/sheets/DateTimeField';
import { ChipRow, Field, Sheet, ToggleChip } from '../components/sheets/Sheet';
import { Button, Text } from '../components/ui';
import { FLOWS, periods, ValidationError, type Flow, type PeriodLog } from '../db/repos';
import { dayStart, toDayKey, todayKey } from '../health/dates';
import { useAppState } from '../state/AppState';
import { useTheme } from '../theme/useTheme';
import { emitCycleChange } from './store';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function PeriodEditSheet({ log, onClose }: { log: PeriodLog | null; onClose: () => void }) {
  const { c } = useTheme();
  const { bump } = useAppState();
  const now = new Date();
  const [start, setStart] = useState(log ? dayStart(log.startDay) : now);
  const [hasEnd, setHasEnd] = useState(!!log?.endDay);
  const [end, setEnd] = useState(log?.endDay ? dayStart(log.endDay) : now);
  const [flow, setFlow] = useState<Flow | null>(log ? log.flow : 'medium');
  const [error, setError] = useState<ValidationError | null>(null);
  const [busy, setBusy] = useState(false);
  const err = (f: string) => (error?.field === f ? error.message : null);

  const done = () => {
    emitCycleChange();
    bump();
    onClose();
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const startDay = toDayKey(start);
      const endDay = hasEnd ? toDayKey(end) : null;
      if (startDay > todayKey()) throw new ValidationError('startDay', 'Start date can’t be in the future.');
      if (endDay && endDay > todayKey()) throw new ValidationError('endDay', 'End date can’t be in the future.');
      if (endDay && endDay < startDay) throw new ValidationError('endDay', 'End date can’t be before the start date.');
      if (log) await periods.update(log.id, { startDay, endDay, flow });
      else await periods.add({ startDay, endDay, flow });
      done();
    } catch (e) {
      setError(e instanceof ValidationError ? e : new ValidationError('form', 'Couldn’t save. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!log) return;
    Alert.alert('Delete this period?', 'This removes it from your history and predictions.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await periods.remove(log.id);
            done();
          } catch {
            setError(new ValidationError('form', 'Couldn’t delete. Please try again.'));
          }
        },
      },
    ]);
  };

  return (
    <Sheet
      visible
      title={log ? 'Edit period' : 'Add a period'}
      onClose={onClose}
      footer={
        <>
          <Button label={log ? 'Save changes' : 'Save period'} onPress={save} loading={busy} />
          {log ? <Button label="Delete period" icon={Trash2} variant="ghost" onPress={remove} /> : null}
        </>
      }
    >
      <Field label="Start date" error={err('startDay')}>
        <DateTimeField label="Start date" mode="date" value={start} onChange={setStart} maximumDate={now} error={!!err('startDay')} />
      </Field>
      <Field label="End date" error={err('endDay')} hint={hasEnd ? undefined : 'Leave open if it’s still going — Bloom assumes your usual length.'}>
        <ChipRow label="End date">
          <ToggleChip label="Still going" role="radio" selected={!hasEnd} onPress={() => setHasEnd(false)} accent={c.cycle} soft={c.cycleSoft} />
          <ToggleChip label="Ended" role="radio" selected={hasEnd} onPress={() => setHasEnd(true)} accent={c.cycle} soft={c.cycleSoft} />
        </ChipRow>
        {hasEnd ? (
          <DateTimeField label="End date" mode="date" value={end} onChange={setEnd} minimumDate={start} maximumDate={now} error={!!err('endDay')} />
        ) : null}
      </Field>
      <Field label="Flow">
        <ChipRow label="Flow">
          {FLOWS.map((f) => (
            <ToggleChip key={f} label={cap(f)} role="radio" selected={flow === f} onPress={() => setFlow(flow === f ? null : f)} accent={c.cycle} soft={c.cycleSoft} />
          ))}
        </ChipRow>
      </Field>
      {err('form') ? <Text tone="danger">{err('form')}</Text> : null}
      <Text variant="caption" tone="muted">
        Saved only on this phone. Periods from Health Connect (e.g. Flo) can be changed in that app.
      </Text>
    </Sheet>
  );
}
