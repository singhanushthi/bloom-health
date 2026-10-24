/**
 * Cycle settings, reminders and privacy — self-contained, for Settings and /cycle/settings.
 * Every change saves immediately and reschedules reminders.
 */
import { Bell, BellOff, Flower2, ShieldCheck } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { ChipRow, Field, ToggleChip } from '../components/sheets/Sheet';
import { Button, Card, CardHeader, Skeleton, Text } from '../components/ui';
import { anyReminderOn } from '../notify/plan';
import { getReminderPermission, requestReminderPermission, type PermissionState } from '../notify/scheduler';
import { useCycleReminderSync } from '../notify/ReminderSync';
import { useAppState } from '../state/AppState';
import { space } from '../theme/tokens';
import { useCycleSettings } from './hooks';
import { ContraceptionNote, Stepper, SwitchRow, TimeRow } from './parts';
import {
  CYCLE_GOAL_HINT,
  CYCLE_GOAL_LABEL,
  CYCLE_GOALS,
  CYCLE_LENGTH_RANGE,
  PERIOD_LENGTH_RANGE,
  type ReminderSettings,
} from './store';
import { useCycleColors } from './theme';

export function CycleSettingsSection({ showCycle = true }: { showCycle?: boolean } = {}) {
  const { c } = useCycleColors();
  const { bump } = useAppState();
  const { settings, loading, update } = useCycleSettings();
  const [perm, setPerm] = useState<PermissionState | null>(null);
  const [permMsg, setPermMsg] = useState<string | null>(null);
  useCycleReminderSync();

  useEffect(() => {
    getReminderPermission().then(setPerm).catch(() => setPerm('unavailable'));
  }, []);

  if (loading) {
    return (
      <Card accessibilityLabel="Loading cycle settings">
        <Skeleton height={20} width={140} />
        <Skeleton height={160} style={{ marginTop: space.md }} />
      </Card>
    );
  }

  const r = settings.reminders;
  const save = async (patch: Parameters<typeof update>[0]) => {
    await update(patch);
    bump();
  };

  const toggleReminder = async (key: keyof Pick<ReminderSettings, 'periodSoon' | 'late' | 'fertile' | 'logDay' | 'pill'>, v: boolean) => {
    setPermMsg(null);
    if (v) {
      const p = await requestReminderPermission(settings.discreet);
      setPerm(p);
      if (p === 'denied') setPermMsg('Notifications are blocked for Bloom. Turn them on in Android settings to get reminders.');
      if (p === 'unavailable') setPermMsg('Reminders aren’t available on this device.');
    }
    await save({ reminders: { [key]: v } });
  };

  const needsPermission = anyReminderOn(settings) && perm !== null && perm !== 'granted' && perm !== 'unavailable';

  return (
    <View style={{ gap: space.md }}>
      {showCycle ? (
        <Card>
          <CardHeader icon={Flower2} label="Your cycle" accent={c.cycle} soft={c.cycleSoft} />
          <View style={{ gap: space.md }}>
            <Stepper
              label="Usual period length"
              value={settings.typicalPeriodLength}
              unit="days"
              min={PERIOD_LENGTH_RANGE.min}
              max={PERIOD_LENGTH_RANGE.max}
              onChange={(v) => save({ typicalPeriodLength: v })}
            />
            <Stepper
              label="Usual cycle length"
              value={settings.typicalCycleLength}
              unit="days"
              min={CYCLE_LENGTH_RANGE.min}
              max={CYCLE_LENGTH_RANGE.max}
              onChange={(v) => save({ typicalCycleLength: v })}
            />
            <Text variant="caption" tone="muted">
              Used until you’ve logged 2 cycles; after that Bloom uses your own average.
            </Text>
            <SwitchRow
              label="My cycles are irregular"
              body="Show a date range instead of a single day."
              value={settings.irregular}
              onChange={(v) => save({ irregular: v })}
            />
            <Field label="Goal">
              <ChipRow label="Goal">
                {CYCLE_GOALS.map((g) => (
                  <ToggleChip key={g} label={CYCLE_GOAL_LABEL[g]} role="radio" selected={settings.goal === g} onPress={() => save({ goal: g })} accent={c.cycle} soft={c.cycleSoft} />
                ))}
              </ChipRow>
              <Text variant="caption" tone="muted">
                {CYCLE_GOAL_HINT[settings.goal]}
              </Text>
            </Field>
            <ContraceptionNote />
          </View>
        </Card>
      ) : null}

      <Card>
        <CardHeader icon={Bell} label="Cycle reminders" accent={c.cycle} soft={c.cycleSoft} />
        <Text tone="muted" style={{ marginBottom: space.xs }}>
          Scheduled on this phone only. Bloom asks for notification permission when you turn one on.
        </Text>
        <SwitchRow label="Period coming in 2 days" value={r.periodSoon} onChange={(v) => toggleReminder('periodSoon', v)} />
        <SwitchRow label="Period may be late" body="4 days after the expected start, if nothing’s logged." value={r.late} onChange={(v) => toggleReminder('late', v)} />
        <SwitchRow label="Fertile window starts" value={r.fertile} onChange={(v) => toggleReminder('fertile', v)} />
        <SwitchRow label="Log your day" body="A daily nudge to log mood and symptoms." value={r.logDay} onChange={(v) => toggleReminder('logDay', v)} />
        {r.logDay ? <TimeRow label="Daily log time" value={r.logTime} onChange={(t) => save({ reminders: { logTime: t } })} /> : null}
        <SwitchRow label="Pill reminder" body="Every day at the same time." value={r.pill} onChange={(v) => toggleReminder('pill', v)} />
        {r.pill ? <TimeRow label="Pill time" value={r.pillTime} onChange={(t) => save({ reminders: { pillTime: t } })} /> : null}
        <View style={{ height: 1, backgroundColor: c.line, marginVertical: space.xs }} />
        <SwitchRow
          label="Discreet wording"
          body={settings.discreet ? 'Notifications say “Bloom reminder” and never mention periods.' : 'Notifications say what they’re about.'}
          value={settings.discreet}
          onChange={(v) => save({ discreet: v })}
        />
        {permMsg || needsPermission ? (
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }} accessibilityLiveRegion="polite">
            <BellOff size={20} color={c.danger} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: space.xs }}>
              <Text tone="danger">{permMsg ?? 'Notifications are off for Bloom, so reminders won’t appear.'}</Text>
              {perm === 'denied' ? (
                <Button label="Open Android settings" variant="secondary" onPress={() => Linking.openSettings().catch(() => {})} />
              ) : (
                <Button
                  label="Allow notifications"
                  variant="secondary"
                  onPress={async () => {
                    const p = await requestReminderPermission(settings.discreet);
                    setPerm(p);
                    setPermMsg(p === 'denied' ? 'Notifications are blocked for Bloom. Turn them on in Android settings to get reminders.' : null);
                    bump();
                  }}
                />
              )}
            </View>
          </View>
        ) : null}
      </Card>

      <Card tint={c.spo2Soft}>
        <CardHeader icon={ShieldCheck} label="Cycle privacy" accent={c.spo2} soft={c.surface} />
        <SwitchRow
          label="Hide cycle data on Today"
          body="Keeps your cycle off the Today screen. It stays in the Cycle tab."
          value={settings.hideOnToday}
          onChange={(v) => save({ hideOnToday: v })}
        />
        <Text tone="muted" style={{ marginTop: space.xs }}>
          Your cycle data stays on this phone. No account, no server, no sharing.
        </Text>
      </Card>
    </View>
  );
}
