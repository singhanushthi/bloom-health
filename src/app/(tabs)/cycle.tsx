/**
 * Cycle tab — Bloom's own, complete period tracker (no Flo needed).
 *
 *  - First time (nothing logged): a short setup (last period, usual lengths, irregular, goal).
 *  - "Today" hero: cycle day, phase, next period (or range), confidence, fertile window by goal.
 *  - Late banner, one-tap "Period started today" / "Period ended today", "Log today".
 *  - Next 3 periods, calendar (logged / predicted / possible / fertile / ovulation / PMS),
 *    ideas for this phase, your periods (edit/delete), links to insights and settings.
 * Health Connect periods (e.g. from Flo) are merged in when connected — optional.
 */
import { router } from 'expo-router';
import {
  CalendarCheck,
  CalendarPlus,
  ChartColumn,
  CircleAlert,
  Droplet,
  Info,
  Lock,
  NotebookPen,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';
import { SourceTag } from '../../components/cards';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { Button, Card, CardHeader, CardSkeleton, Chip, EmptyNote, IconButton, Text } from '../../components/ui';
import { CycleCalendar } from '../../cycle/CycleCalendar';
import { CycleSetup } from '../../cycle/CycleSetup';
import { CycleDayLogSheet } from '../../cycle/DayLogSheet';
import { useCycleOverview, useCycleSettings } from '../../cycle/hooks';
import { LateBanner } from '../../cycle/LateBanner';
import { ContraceptionNote, LinkRow } from '../../cycle/parts';
import { PeriodEditSheet } from '../../cycle/PeriodEditSheet';
import { PhaseSuggestionsCard } from '../../cycle/PhaseSuggestionsCard';
import { endPeriodToday, startPeriodToday } from '../../cycle/store';
import { PHASE_TITLE } from '../../cycle/suggestions';
import { fertileText, nextPeriodText, shortDay, upcomingRows } from '../../cycle/text';
import { useCycleColors } from '../../cycle/theme';
import type { PeriodLog } from '../../db/repos';
import { CONFIDENCE_LABEL } from '../../health/cyclePrediction';
import { formatDay, todayKey, type DayKey } from '../../health/dates';
import { useCycleReminderSync } from '../../notify/ReminderSync';
import { useAppState } from '../../state/AppState';
import { space } from '../../theme/tokens';

export default function CycleScreen() {
  const { c, cycleText } = useCycleColors();
  const { bump, demoMode } = useAppState();
  const { settings, loading: settingsLoading } = useCycleSettings();
  const { loading, result, reload } = useCycleOverview();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetDay, setSheetDay] = useState<DayKey | null>(null);
  const [editing, setEditing] = useState<PeriodLog | 'new' | null>(null);
  const [busy, setBusy] = useState<'start' | 'end' | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  useCycleReminderSync();
  const today = todayKey();

  const o = result?.data ?? null;
  const d = o?.cycle ?? null;
  const goal = d?.settings.goal ?? settings.goal;

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const quick = async (kind: 'start' | 'end') => {
    if (demoMode) {
      setActionMsg('Demo mode is on — turn it off in Settings to log your own periods.');
      return;
    }
    setBusy(kind);
    setActionMsg(null);
    try {
      if (kind === 'start') {
        await startPeriodToday(today);
        setActionMsg('Saved — period started today.');
      } else {
        const ok = await endPeriodToday(today);
        setActionMsg(ok ? 'Saved — period ended today.' : 'No open period to end.');
      }
      bump();
    } catch {
      setActionMsg('Couldn’t save. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <Text variant="display" accessibilityRole="header" style={{ flex: 1 }}>
        Cycle
      </Text>
      <IconButton icon={ChartColumn} onPress={() => router.push('/cycle/insights')} accessibilityLabel="Cycle insights" />
      <IconButton icon={Settings2} onPress={() => router.push('/cycle/settings')} accessibilityLabel="Cycle settings and reminders" />
    </View>
  );

  const calendar = <CycleCalendar data={d} today={today} goal={goal} onDayPress={setSheetDay} />;

  const openLog = d?.periodLogs.filter((p) => !p.endDay).slice(-1)[0] ?? null;
  const last = d?.periods[d.periods.length - 1];
  const inPeriodNow = !!last && today <= last.end && today >= last.start;

  const quickActions = (
    <View style={{ gap: space.xs }}>
      {openLog ? (
        <Button
          label="Period ended today"
          icon={CalendarCheck}
          onPress={() => quick('end')}
          loading={busy === 'end'}
          accessibilityHint={`Marks the period that started ${formatDay(openLog.startDay, { day: 'numeric', month: 'long' })} as ended today`}
        />
      ) : !inPeriodNow ? (
        <Button label="Period started today" icon={Droplet} onPress={() => quick('start')} loading={busy === 'start'} accessibilityHint="Logs today as the first day of your period" />
      ) : null}
      <Button label="Log today" icon={NotebookPen} variant="secondary" onPress={() => setSheetDay(today)} accessibilityHint="Flow, pain, symptoms, mood and more" />
      {actionMsg ? (
        <Text tone={actionMsg.startsWith('Couldn') ? 'danger' : 'muted'} accessibilityLiveRegion="polite">
          {actionMsg}
        </Text>
      ) : null}
    </View>
  );

  const body = () => {
    if ((loading && !result) || settingsLoading) return <CardSkeleton label="cycle" height={420} />;
    if (!result) return null;
    if (result.status === 'denied' || result.status === 'error') {
      return (
        <Card>
          <EmptyNote
            icon={result.status === 'denied' ? Lock : CircleAlert}
            accent={c.cycle}
            title={result.status === 'denied' ? 'Permission needed' : 'Couldn’t read cycle data'}
            body={result.status === 'denied' ? 'Allow Menstruation in Settings → Health Connect.' : `Pull down to retry. ${result.error ?? ''}`}
          />
        </Card>
      );
    }
    if (!d || !d.hasData) {
      if (!demoMode && !settings.setupDone) return <CycleSetup />;
      return (
        <>
          <Card tint={c.cycleSoft}>
            <EmptyNote
              icon={Droplet}
              accent={c.cycle}
              title="No period logged yet"
              body="Tap “Period started today” when it starts, or add a past period to see predictions straight away."
            />
            <ContraceptionNote style={{ marginTop: space.sm }} />
          </Card>
          {quickActions}
          <Button label="Add a past period" icon={CalendarPlus} variant="secondary" onPress={() => setEditing('new')} />
          {calendar}
        </>
      );
    }

    const p = d.predictions;
    const phase = d.phaseDetail;
    const fert = fertileText(p, goal, today);
    const heroLabel = [
      `Cycle day ${d.cycleDay}`,
      phase ? PHASE_TITLE[phase] : '',
      nextPeriodText(p, today),
      `${CONFIDENCE_LABEL[p.confidence]}, based on ${p.cyclesUsed ? `${p.cyclesUsed} cycles` : 'your usual cycle length'}`,
      goal !== 'track' && fert ? fert : '',
      'Estimates only. Not a method of contraception.',
    ]
      .filter(Boolean)
      .join('. ');

    return (
      <>
        <Card tint={c.cycleSoft}>
          <View accessible accessibilityLabel={heroLabel}>
            <CardHeader
              icon={Sparkles}
              label="Today"
              accent={c.cycle}
              soft={c.surface}
              right={<Chip label={CONFIDENCE_LABEL[p.confidence]} bg={c.surface} />}
            />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xs }}>
              <Text variant="label" tone="muted" style={{ marginBottom: 12 }}>
                DAY
              </Text>
              <Text variant="hero" style={{ color: cycleText }}>
                {d.cycleDay}
              </Text>
              <Text tone="muted" style={{ marginBottom: 10 }}>
                of ~{p.cycleLength}
              </Text>
            </View>
            {phase ? (
              <Text variant="title" style={{ color: cycleText }}>
                {PHASE_TITLE[phase]}
              </Text>
            ) : null}
            <Text variant="bodyStrong" style={{ marginTop: space.xs }}>
              {nextPeriodText(p, today)}
            </Text>
            {fert ? (
              <Text tone={goal === 'track' ? 'muted' : 'ink'} variant={goal === 'track' ? 'body' : 'bodyStrong'} style={{ marginTop: space.xxs }}>
                {fert}
              </Text>
            ) : null}
            <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
              {p.cyclesUsed >= 2 ? `Based on your last ${p.cyclesUsed} cycles` : `Based on your usual ${p.cycleLength}-day cycle until you log 2 cycles`}
              {p.irregular ? ` · ${p.irregularSource === 'detected' ? 'your cycles vary, so dates are a range' : 'irregular cycles: dates are a range'}` : ''}.
            </Text>
            <ContraceptionNote />
            <SourceTag sources={result.sources} fallback="Logged in Bloom" />
          </View>
        </Card>

        {p.showLateBanner ? <LateBanner daysLate={p.daysLate} goal={goal} compact /> : null}

        {quickActions}

        <Card>
          <CardHeader icon={CalendarPlus} label="Next periods" accent={c.cycle} soft={c.cycleSoft} />
          {upcomingRows(p).map((row, i) => (
            <View
              key={row.key}
              accessible
              accessibilityLabel={row.a11y}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}
            >
              <Text tone="muted" style={{ width: 28 }}>
                {i + 1}
              </Text>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {row.label}
              </Text>
              <Text variant="caption" tone="muted">
                estimate
              </Text>
            </View>
          ))}
        </Card>

        {calendar}

        {o ? <PhaseSuggestionsCard current={phase} overview={o} /> : null}

        <Card>
          <CardHeader icon={Droplet} label="Cycle history" accent={c.cycle} soft={c.cycleSoft} />
          {d.history.slice(0, 12).map((h, i) => {
            const log = d.periodLogs.find((l) => l.startDay === h.start) ?? null;
            const sp = d.sourcedPeriods.find((x) => x.start === h.start);
            const src = sp?.sources.map((s) => (s === 'local' ? 'Bloom' : 'Health Connect')).join(' + ') ?? '';
            const desc = `Started ${formatDay(h.start, { day: 'numeric', month: 'long', year: 'numeric' })}. Period ${h.periodLength} days. ${
              h.cycleLength === null ? 'Current cycle' : `${h.cycleLength} day cycle${h.counted ? '' : ', left out of the average as unusual'}`
            }${src ? `. From ${src}` : ''}.`;
            return (
              <View key={h.start} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, gap: space.sm }}>
                <View style={{ flex: 1 }} accessible accessibilityLabel={desc}>
                  <Text variant="bodyStrong">{formatDay(h.start, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  <Text variant="caption" tone="muted">
                    Period {h.periodLength} {h.periodLength === 1 ? 'day' : 'days'} · {h.cycleLength === null ? 'current cycle' : `${h.cycleLength}-day cycle`}
                    {h.cycleLength !== null && !h.counted ? ' (not averaged)' : ''}
                    {src ? ` · ${src}` : ''}
                  </Text>
                </View>
                {log ? (
                  <IconButton icon={Pencil} onPress={() => setEditing(log)} accessibilityLabel={`Edit period starting ${shortDay(h.start)}`} />
                ) : null}
              </View>
            );
          })}
          {!demoMode ? (
            <Button label="Add a past period" icon={Plus} variant="secondary" onPress={() => setEditing('new')} style={{ marginTop: space.sm }} />
          ) : null}
          <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
            Periods made from day logs (flow) change when you edit those days.
          </Text>
        </Card>

        {d.partialHistory ? (
          <Card tint={c.stepsSoft}>
            <EmptyNote icon={Info} accent={c.steps} title="Only recent Health Connect history" body="Allow “Access past data” for Bloom in Health Connect to include older cycles." />
          </Card>
        ) : null}

        <LinkRow icon={ChartColumn} label="Insights" hint="Averages, cycle lengths, symptom patterns" onPress={() => router.push('/cycle/insights')} accent={c.cycle} soft={c.cycleSoft} />
        <LinkRow icon={Settings2} label="Cycle settings & reminders" hint="Usual lengths, goal, reminders, privacy" onPress={() => router.push('/cycle/settings')} accent={c.cycle} soft={c.cycleSoft} />
      </>
    );
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {header}
      <DemoBanner />
      {body()}
      {sheetDay ? <CycleDayLogSheet day={sheetDay} onClose={() => setSheetDay(null)} /> : null}
      {editing ? <PeriodEditSheet log={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}
