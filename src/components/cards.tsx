/**
 * Today-screen cards. Each card owns its loading (skeleton), empty, denied and error states,
 * shows where its data came from (source label), and offers the matching "log" action so
 * Bloom works with no other app installed.
 *
 * Accessibility: the summary label sits on an inner content View (not the Card) so action
 * buttons stay separately focusable.
 */
import {
  CalendarClock,
  CircleAlert,
  Droplet,
  Flame,
  Flower2,
  Footprints,
  HeartPulse,
  Info,
  Lock,
  MapPin,
  Moon,
  Pencil,
  Plus,
  Smartphone,
  Star,
  Watch,
  Wind,
} from 'lucide-react-native';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import {
  PHASE_LABEL,
  type ActivityToday,
  type CycleResult,
  type HeartToday,
  type MetricResult,
  type SleepNight,
  type Spo2Latest,
} from '../health';
import { phoneStepsInHealthConnect } from '../health/capabilities';
import { formatDay, formatDuration, formatDurationLong } from '../health/dates';
import { sourceLabel } from '../health/sources';
import { useStepSensor } from '../sensors/StepSensor';
import { useAppState } from '../state/AppState';
import { space } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { PatternSwatch, Ring, Sparkline, StageBar, type StageSegment } from './charts';
import { useLogSheets } from './sheets/LogSheets';
import { Button, Card, CardHeader, CardSkeleton, Chip, EmptyNote, Text } from './ui';

/** "Source: Logged in Bloom" line shown at the bottom of every card with data. */
export function SourceTag({ sources, fallback }: { sources: string[]; fallback?: string }) {
  const { c } = useTheme();
  const text = sourceLabel(sources) ?? fallback;
  if (!text) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Source: ${text}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm }}
    >
      <Smartphone size={14} color={c.muted} />
      <Text variant="caption" tone="muted" style={{ flex: 1 }}>
        Source: {text}
      </Text>
    </View>
  );
}

/** Renders the right non-ok state for a metric, or null when data is ok. */
function StateNote({
  result,
  accent,
  emptyTitle,
  emptyBody,
}: {
  result: MetricResult<unknown>;
  accent: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  if (result.status === 'denied')
    return (
      <EmptyNote
        icon={Lock}
        accent={accent}
        title="Permission needed"
        body="Bloom can't read this from Health Connect yet. Use Settings → Health Connect → Manage permissions."
      />
    );
  if (result.status === 'error')
    return (
      <EmptyNote
        icon={CircleAlert}
        accent={accent}
        title="Couldn't read this"
        body={`Pull down to try again. ${result.error ? `(${result.error})` : ''}`}
      />
    );
  return <EmptyNote icon={CircleAlert} accent={accent} title={emptyTitle} body={emptyBody} />;
}

/* --------------------------------- Cycle -------------------------------- */

export function CycleCard({ loading, result }: { loading: boolean; result: MetricResult<CycleResult> | null }) {
  const { c } = useTheme();
  const { open } = useLogSheets();
  if (loading && !result) return <CardSkeleton label="cycle" height={190} />;
  if (!result) return null;
  const d = result.data;
  if (result.status !== 'ok' || !d || d.cycleDay === null || d.phase === null) {
    return (
      <Card tint={c.cycleSoft}>
        <CardHeader icon={Flower2} label="Cycle" accent={c.cycle} soft={c.surface} />
        <StateNote
          result={result}
          accent={c.cycle}
          emptyTitle="No period logged yet"
          emptyBody="Log your last period to see your cycle day, phase and an estimate of the next one."
        />
        <Button label="Log period" icon={Droplet} onPress={() => open('period')} style={{ marginTop: space.md }} />
      </Card>
    );
  }

  const until = d.daysUntilNextPeriod ?? 0;
  const nextText =
    d.daysLate > 0
      ? `Period is ${d.daysLate} ${d.daysLate === 1 ? 'day' : 'days'} later than estimated`
      : until === 0
        ? 'Period estimated to start today'
        : `Next period in about ${until} ${until === 1 ? 'day' : 'days'}`;
  const nextDate = d.nextPeriodStart ? formatDay(d.nextPeriodStart, { day: 'numeric', month: 'short' }) : '';
  const src = sourceLabel(result.sources) ?? 'Logged in Bloom';
  const label = `Cycle day ${d.cycleDay}. Phase: ${PHASE_LABEL[d.phase]}. ${nextText}${
    nextDate ? `, around ${nextDate}` : ''
  }. Estimate based on ${d.usedDefault ? 'a default 28 day cycle' : `your last ${d.cyclesUsed} cycles averaging ${d.averageCycleLength} days`}. Source: ${src}.`;

  const frac = Math.min(1, d.cycleDay / d.averageCycleLength);

  return (
    <Card tint={c.cycleSoft}>
      <View accessible accessibilityLabel={label}>
        <CardHeader
          icon={Flower2}
          label="Cycle"
          accent={c.cycle}
          soft={c.surface}
          right={<Chip label={PHASE_LABEL[d.phase]} bg={c.surface} icon={Flower2} iconColor={c.cycle} />}
        />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xs }}>
          <Text variant="label" tone="muted" style={{ marginBottom: 12 }}>
            DAY
          </Text>
          <Text variant="hero">{d.cycleDay}</Text>
          <Text tone="muted" style={{ marginBottom: 10 }}>
            of ~{d.averageCycleLength}
          </Text>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface, marginTop: space.xs, overflow: 'hidden' }}>
          <View style={{ width: `${frac * 100}%`, height: 8, borderRadius: 4, backgroundColor: c.cycle }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.md }}>
          <CalendarClock size={18} color={c.ink} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {nextText}
            {nextDate && d.daysLate === 0 ? ` · ${nextDate}` : ''}
          </Text>
        </View>
        <Text variant="caption" tone="muted" style={{ marginTop: space.xxs }}>
          Estimate, not contraception advice ·{' '}
          {d.usedDefault ? 'default 28-day cycle until 2+ cycles are logged' : `avg of last ${d.cyclesUsed} cycles`}
        </Text>
        <SourceTag sources={result.sources} fallback="Logged in Bloom" />
      </View>
    </Card>
  );
}

/* ------------------------------- Activity ------------------------------- */

export function ActivityCard({
  loading,
  result,
  goal,
}: {
  loading: boolean;
  result: MetricResult<ActivityToday> | null;
  goal: number;
}) {
  const { c } = useTheme();
  const { open } = useLogSheets();
  const { availability, granted, demoMode } = useAppState();
  const sensor = useStepSensor();
  if (loading && !result) return <CardSkeleton label="activity" height={200} />;
  if (!result) return null;
  const d = result.data;

  const hcSteps = availability === 'available' && granted.has('Steps');
  const phoneHc = phoneStepsInHealthConnect() === 'likely';
  const needsSensor = !demoMode && !hcSteps && sensor.permission !== 'granted' && sensor.permission !== 'unavailable';

  const sensorNote =
    d?.stepSource === 'sensor' ? (
      <View style={{ flexDirection: 'row', gap: 6, marginTop: space.sm }}>
        <Info size={16} color={c.muted} style={{ marginTop: 1 }} />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          Counts only while Bloom is open — Android 14+ with Health Connect counts all day.
        </Text>
      </View>
    ) : null;

  const actions = (
    <View style={{ gap: space.xs, marginTop: space.md }}>
      {needsSensor ? (
        <Button
          label="Count steps with this phone"
          icon={Footprints}
          onPress={() => sensor.request()}
          accessibilityHint="Asks for physical activity permission so Bloom can count steps while it's open"
        />
      ) : null}
      <Button label="Edit today's steps" variant="secondary" icon={Pencil} onPress={() => open('steps')} />
    </View>
  );

  if (result.status !== 'ok' || !d) {
    const emptyBody = hcSteps
      ? phoneHc
        ? 'No steps yet. Health Connect starts counting from when you allowed access — walk a little and pull to refresh.'
        : 'No steps from Health Connect yet today. Bloom also counts while it’s open, or you can enter today’s steps.'
      : sensor.permission === 'denied'
        ? 'Physical activity access is off. Allow it in Android Settings → Apps → Bloom → Permissions, or enter today’s steps.'
        : sensor.permission === 'unavailable'
          ? 'This phone has no step sensor Bloom can use. Enter today’s steps, or connect Health Connect in Settings.'
          : 'Walk with Bloom open to count steps, or enter today’s steps. For all-day counting on Android 14+, connect Health Connect in Settings.';
    return (
      <Card>
        <CardHeader icon={Footprints} label="Activity" accent={c.steps} soft={c.stepsSoft} />
        <StateNote result={result} accent={c.steps} emptyTitle="No steps yet today" emptyBody={emptyBody} />
        {actions}
      </Card>
    );
  }
  const pct = Math.round((d.steps / goal) * 100);
  const src = sourceLabel(result.sources) ?? 'Phone';
  const label = `Activity today: ${d.steps.toLocaleString()} steps of ${goal.toLocaleString()} goal, ${pct} percent. ${d.distanceKm.toFixed(1)} kilometres${d.distanceEstimated ? ', estimated from stride length' : ''}.${
    d.activeKcal !== null ? ` ${d.activeKcal} active kilocalories.` : ''
  } Source: ${src}.`;
  return (
    <Card>
      <View accessible accessibilityLabel={label}>
        <CardHeader icon={Footprints} label="Activity" accent={c.steps} soft={c.stepsSoft} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Ring value={d.steps} goal={goal} color={c.steps} track={c.stepsSoft} accessibilityLabel={label}>
            <Text variant="caption" tone="muted">
              {pct}%
            </Text>
            <Text variant="label" tone="muted">
              {pct >= 100 ? 'GOAL MET' : 'OF GOAL'}
            </Text>
          </Ring>
          <View style={{ flex: 1, gap: space.xs }}>
            <View>
              <Text variant="display">{d.steps.toLocaleString()}</Text>
              <Text variant="caption" tone="muted">
                steps · goal {goal.toLocaleString()}
              </Text>
            </View>
            <Stat
              icon={MapPin}
              color={c.steps}
              value={`${d.distanceKm.toFixed(1)} km`}
              label={d.distanceEstimated ? 'est. distance' : 'distance'}
            />
            {d.activeKcal !== null ? <Stat icon={Flame} color={c.steps} value={`${d.activeKcal} kcal`} label="active" /> : null}
          </View>
        </View>
        {sensorNote}
        <SourceTag sources={result.sources} />
      </View>
      {actions}
    </Card>
  );
}

function Stat({ icon: Icon, color, value, label }: { icon: typeof Flame; color: string; value: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Icon size={16} color={color} />
      <Text variant="bodyStrong">{value}</Text>
      <Text tone="muted">{label}</Text>
    </View>
  );
}

/* --------------------------------- Sleep -------------------------------- */

export function SleepCard({ loading, result }: { loading: boolean; result: MetricResult<SleepNight> | null }) {
  const { c } = useTheme();
  const { open } = useLogSheets();
  const [w, setW] = useState(0);
  if (loading && !result) return <CardSkeleton label="sleep" height={170} />;
  if (!result) return null;
  const d = result.data;
  const logBtn = <Button label="Log sleep" variant="secondary" icon={Moon} onPress={() => open('sleep')} style={{ marginTop: space.md }} />;
  if (result.status !== 'ok' || !d) {
    return (
      <Card>
        <CardHeader icon={Moon} label="Sleep" accent={c.sleep} soft={c.sleepSoft} />
        <StateNote
          result={result}
          accent={c.sleep}
          emptyTitle="No sleep logged for last night"
          emptyBody="Add your bedtime and wake time. A connected watch can fill this in automatically."
        />
        {logBtn}
      </Card>
    );
  }

  const segs: StageSegment[] = d.hasStages
    ? [
        { key: 'deep', label: 'Deep', minutes: d.stages.deep ?? 0, color: c.stageDeep, pattern: 'solid' as const },
        { key: 'light', label: 'Light', minutes: d.stages.light ?? 0, color: c.stageLight, pattern: 'stripes' as const },
        { key: 'rem', label: 'REM', minutes: d.stages.rem ?? 0, color: c.stageRem, pattern: 'dots' as const },
        { key: 'awake', label: 'Awake', minutes: d.stages.awake ?? 0, color: c.stageAwake, pattern: 'hollow' as const },
      ].filter((s) => s.minutes > 0)
    : [];
  const bed = new Date(d.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const wake = new Date(d.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const src = sourceLabel(result.sources) ?? 'Logged in Bloom';
  const label = `Last night's sleep: ${formatDurationLong(d.asleepMin)} asleep, from ${bed} to ${wake}.${
    d.quality ? ` Quality ${d.quality} out of 5.` : ''
  }${segs.length ? ' ' + segs.map((s) => `${s.label} ${formatDurationLong(s.minutes)}`).join(', ') + '.' : ''} Source: ${src}.`;

  return (
    <Card>
      <View accessible accessibilityLabel={label}>
        <CardHeader icon={Moon} label="Sleep · last night" accent={c.sleep} soft={c.sleepSoft} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs, flexWrap: 'wrap' }}>
          <Text variant="display">{formatDuration(d.asleepMin)}</Text>
          <Text tone="muted">
            {bed} – {wake}
          </Text>
        </View>
        {d.quality ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} size={16} color={c.sleep} fill={i < (d.quality ?? 0) ? c.sleep : 'transparent'} />
            ))}
            <Text variant="caption" tone="muted" style={{ marginLeft: 4 }}>
              quality {d.quality}/5
            </Text>
          </View>
        ) : null}
        {segs.length ? (
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ marginTop: space.sm }}>
            {w > 0 ? <StageBar segments={segs} width={w} /> : <View style={{ height: 18 }} />}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
              {segs.map((s) => (
                <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <PatternSwatch color={s.color} pattern={s.pattern} />
                  <Text variant="caption">
                    {s.label} {formatDuration(s.minutes)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
            Duration only — stages appear when a watch records them.
          </Text>
        )}
        <SourceTag sources={result.sources} fallback="Logged in Bloom" />
      </View>
      {logBtn}
    </Card>
  );
}

/* ------------------------------ Vitals (HR) ------------------------------ */

function VitalsEmpty({ accent, title, kind }: { accent: string; title: string; kind: 'hr' | 'spo2' }) {
  const { open } = useLogSheets();
  return (
    <>
      <EmptyNote icon={CircleAlert} accent={accent} title={title} body="Add a reading from a pulse oximeter or your watch screen." />
      <Button label="Add reading" icon={Plus} onPress={() => open('reading', { kind })} style={{ marginTop: space.md }} />
      <Button
        label="Connect a watch in Settings for automatic readings"
        variant="ghost"
        icon={Watch}
        onPress={() => router.push('/(tabs)/settings')}
        style={{ marginTop: space.xs, paddingHorizontal: space.sm }}
        accessibilityHint="Opens Settings, Connected apps"
      />
    </>
  );
}

export function HeartCard({ loading, result }: { loading: boolean; result: MetricResult<HeartToday> | null }) {
  const { c } = useTheme();
  const { open } = useLogSheets();
  const [w, setW] = useState(0);
  if (loading && !result) return <CardSkeleton label="heart rate" height={170} />;
  if (!result) return null;
  const d = result.data;
  if (result.status !== 'ok' || !d) {
    return (
      <Card>
        <CardHeader icon={HeartPulse} label="Heart rate" accent={c.heart} soft={c.heartSoft} />
        {result.status === 'empty' ? (
          <VitalsEmpty accent={c.heart} title="No heart-rate readings today" kind="hr" />
        ) : (
          <StateNote result={result} accent={c.heart} emptyTitle="" emptyBody="" />
        )}
      </Card>
    );
  }
  const big = d.restingBpm ?? d.latest?.bpm ?? null;
  const bigLabel = d.restingBpm !== null ? 'bpm resting' : 'bpm latest';
  const latestTime = d.latest ? new Date(d.latest.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const src = sourceLabel(result.sources) ?? 'Logged in Bloom';
  const label = `Heart rate. ${d.restingBpm !== null ? `Resting ${d.restingBpm} beats per minute.` : d.latest ? `Latest ${d.latest.bpm} beats per minute at ${latestTime}.` : ''}${
    d.minBpm !== null ? ` Today's range ${d.minBpm} to ${d.maxBpm} beats per minute.` : ''
  } Source: ${src}.`;
  const points = d.hourly.filter((v) => v !== null).length;
  return (
    <Card>
      <View accessible accessibilityLabel={label}>
        <CardHeader icon={HeartPulse} label="Heart rate" accent={c.heart} soft={c.heartSoft} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text variant="display">{big ?? '—'}</Text>
          <Text variant="caption" tone="muted">
            {bigLabel}
            {d.restingBpm === null && latestTime ? ` · ${latestTime}` : ''}
          </Text>
        </View>
        {points >= 2 ? (
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ marginVertical: space.xs }}>
            {w > 0 ? <Sparkline values={d.hourly} color={c.heart} width={w} /> : <View style={{ height: 44 }} />}
          </View>
        ) : null}
        {d.minBpm !== null ? (
          <Text variant="caption" tone="muted">
            Today {d.minBpm}–{d.maxBpm} bpm
          </Text>
        ) : null}
        <SourceTag sources={result.sources} />
      </View>
      <Button label="Add reading" variant="secondary" icon={Plus} onPress={() => open('reading', { kind: 'hr' })} style={{ marginTop: space.md }} />
    </Card>
  );
}

/* --------------------------------- SpO2 --------------------------------- */

export function Spo2Card({ loading, result }: { loading: boolean; result: MetricResult<Spo2Latest> | null }) {
  const { c } = useTheme();
  const { open } = useLogSheets();
  if (loading && !result) return <CardSkeleton label="blood oxygen" height={170} />;
  if (!result) return null;
  const d = result.data;
  if (result.status !== 'ok' || !d) {
    return (
      <Card>
        <CardHeader icon={Wind} label="Blood oxygen (SpO₂)" accent={c.spo2} soft={c.spo2Soft} />
        {result.status === 'empty' ? (
          <VitalsEmpty accent={c.spo2} title="No SpO₂ reading this week" kind="spo2" />
        ) : (
          <StateNote result={result} accent={c.spo2} emptyTitle="" emptyBody="" />
        )}
      </Card>
    );
  }
  const when = new Date(d.time);
  const whenText = when.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const src = sourceLabel(result.sources) ?? 'Logged in Bloom';
  return (
    <Card>
      <View accessible accessibilityLabel={`Blood oxygen ${d.percent} percent, measured ${whenText}. Source: ${src}.`}>
        <CardHeader icon={Wind} label="Blood oxygen (SpO₂)" accent={c.spo2} soft={c.spo2Soft} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
          <Text variant="display">{d.percent}</Text>
          <Text variant="bodyStrong">%</Text>
          <Text variant="caption" tone="muted" style={{ marginLeft: space.xs }}>
            {whenText}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 3, marginVertical: space.sm }}>
          {Array.from({ length: 10 }, (_, i) => {
            // One droplet per % above 90 — a shape-based gauge, not colour-only.
            const filled = i < Math.round(d.percent - 90);
            return <Droplet key={i} size={12} color={c.spo2} fill={filled ? c.spo2 : 'transparent'} strokeWidth={1.8} />;
          })}
        </View>
        <SourceTag sources={result.sources} />
      </View>
      <Button label="Add reading" variant="secondary" icon={Plus} onPress={() => open('reading', { kind: 'spo2' })} style={{ marginTop: space.xs }} />
    </Card>
  );
}
