/**
 * Building blocks for the Today screen: the "at a glance" tiles, the Quick log row, the compact
 * Move and Sleep & heart cards (each expands to the full detail cards), the small Ask Bloom card
 * and the "Customise Today" sheet.
 *
 * Rules: one short line + a small text button for empty states; numbers in Instrument Serif;
 * every control ≥44 px with an accessibility label; meaning never by colour alone.
 */
import { router } from 'expo-router';
import {
  Activity,
  ChevronRight,
  Droplet,
  Footprints,
  GlassWater,
  HeartPulse,
  Moon,
  Plus,
  Scale,
  Sparkles,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import type { ActivityToday, HeartToday, MetricResult, SleepNight, Spo2Latest } from '../health';
import { formatDuration } from '../health/dates';
import type { PlanState } from '../plan/data';
import { useStepSensor } from '../sensors/StepSensor';
import { useAppState, type TrackId } from '../state/AppState';
import { radius, space, touch } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { ActivityCard, HeartCard, SleepCard, Spo2Card } from './cards';
import { Ring } from './charts';
import { useLogSheets } from './sheets/LogSheets';
import { Sheet } from './sheets/Sheet';
import { Card, Skeleton, StatTile, Text, TextButton, QuickAction } from './ui';
import { TODAY_SECTIONS, type TodaySectionId } from './usePref';

const GLASS_ML = 250;

/* ------------------------------- At a glance ------------------------------ */

export function GlanceGrid({
  plan,
  activity,
  stepGoal,
  tracks,
}: {
  plan: PlanState | null;
  activity: MetricResult<ActivityToday> | null;
  stepGoal: number;
  tracks: TrackId[];
}) {
  const { c } = useTheme();
  const steps = activity?.status === 'ok' && activity.data ? activity.data.steps : null;
  const a = plan?.allowance ?? null;
  const eaten = plan?.totals.kcal ?? null;
  const waterGoal = plan?.plan?.targets?.waterMl ?? 2000;
  const glasses = plan ? Math.round(plan.waterMl / GLASS_ML) : null;
  const goalGlasses = Math.max(1, Math.round(waterGoal / GLASS_ML));
  const kg = plan?.latestMorning?.kg ?? plan?.weights[plan.weights.length - 1]?.kg ?? null;
  const dir = plan?.direction;
  const dirText = dir
    ? dir.dir === 'flat'
      ? 'Steady this week'
      : `${dir.dir === 'down' ? 'Down' : 'Up'} ${Math.abs(dir.delta).toFixed(1)} kg this week`
    : kg !== null
      ? 'Latest weigh-in'
      : 'Not logged yet';

  const tiles: React.ReactNode[] = [];
  if (tracks.includes('steps')) {
    tiles.push(
      <StatTile
        key="steps"
        icon={Footprints}
        label="Steps"
        value={steps !== null ? steps.toLocaleString() : '—'}
        sub={`Goal ${stepGoal.toLocaleString()}`}
        accent={c.steps}
        soft={c.stepsSoft}
        onPress={() => router.push('/(tabs)/trends')}
        accessibilityLabel={`Steps: ${steps !== null ? steps.toLocaleString() : 'none yet'} of ${stepGoal.toLocaleString()} goal`}
        accessibilityHint="Opens Trends"
        style={tileStyle}
      />
    );
  }
  tiles.push(
    <StatTile
      key="food"
      icon={Utensils}
      label="Food"
      value={eaten !== null ? eaten.toLocaleString() : '—'}
      unit="kcal"
      sub={a ? `Aim ${a.min.toLocaleString()}–${a.max.toLocaleString()}` : 'Eaten today'}
      accent={c.steps}
      soft={c.stepsSoft}
      onPress={() => router.push('/food')}
      accessibilityLabel={`Food: ${eaten ?? 0} kilocalories eaten${a ? `, aim around ${a.min} to ${a.max}` : ''}`}
      accessibilityHint="Opens today's food"
      style={tileStyle}
    />,
    <StatTile
      key="water"
      icon={GlassWater}
      label="Water"
      value={glasses !== null ? String(glasses) : '—'}
      unit={`of ${goalGlasses} glasses`}
      sub={plan ? `${(plan.waterMl / 1000).toFixed(2)} L` : undefined}
      accent={c.sleep}
      soft={c.sleepSoft}
      onPress={() => router.push('/food')}
      accessibilityLabel={`Water: ${glasses ?? 0} of ${goalGlasses} glasses`}
      accessibilityHint="Opens today's food and water"
      style={tileStyle}
    />,
    <StatTile
      key="weight"
      icon={Scale}
      label="Weight"
      value={kg !== null ? kg.toFixed(1) : '—'}
      unit={kg !== null ? 'kg' : undefined}
      sub={dirText}
      accent={c.spo2}
      soft={c.spo2Soft}
      onPress={() => router.push('/weight')}
      accessibilityLabel={kg !== null ? `Weight: ${kg.toFixed(1)} kilograms. ${dirText}` : 'Weight: not logged yet'}
      accessibilityHint="Opens weight log and history"
      style={tileStyle}
    />
  );
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{tiles}</View>;
}

const tileStyle = { flexGrow: 1, flexBasis: '40%' as const };

/* -------------------------------- Quick log ------------------------------- */

export function QuickLogRow({ tracks, onWater }: { tracks: TrackId[]; onWater: () => void }) {
  const { c } = useTheme();
  const { open } = useLogSheets();
  const items: { key: string; icon: LucideIcon; label: string; a11y: string; hint: string; accent: string; soft: string; onPress: () => void }[] = [
    { key: 'weight', icon: Scale, label: 'Weight', a11y: 'Log weight', hint: 'Opens the weight log', accent: c.spo2, soft: c.spo2Soft, onPress: () => router.push('/weight') },
    { key: 'food', icon: Utensils, label: 'Food', a11y: 'Log food', hint: 'Search, recent, favourites or AI quick add', accent: c.steps, soft: c.stepsSoft, onPress: () => router.push('/food/add') },
    { key: 'water', icon: GlassWater, label: 'Water +1', a11y: 'Add a glass of water, 250 millilitres', hint: 'Logs right away; you can undo', accent: c.sleep, soft: c.sleepSoft, onPress: onWater },
    { key: 'activity', icon: Activity, label: 'Activity', a11y: 'Log activity', hint: 'Walk, yoga, gym and more', accent: c.heart, soft: c.heartSoft, onPress: () => router.push('/activity/add') },
  ];
  if (tracks.includes('cycle'))
    items.push({ key: 'period', icon: Droplet, label: 'Period', a11y: 'Log period', hint: 'Start date, end date and flow', accent: c.cycle, soft: c.cycleSoft, onPress: () => open('period') });
  if (tracks.includes('sleep'))
    items.push({ key: 'sleep', icon: Moon, label: 'Sleep', a11y: 'Log sleep', hint: 'Bedtime, wake time and quality', accent: c.sleep, soft: c.sleepSoft, onPress: () => open('sleep') });
  if (items.length < 6 && tracks.includes('heart'))
    items.push({ key: 'reading', icon: HeartPulse, label: 'Reading', a11y: 'Add heart rate or SpO₂ reading', hint: 'Heart rate or blood oxygen', accent: c.heart, soft: c.heartSoft, onPress: () => open('reading') });
  return (
    <Card style={{ paddingHorizontal: space.xs, paddingVertical: space.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {items.slice(0, 6).map((it) => (
          <QuickAction
            key={it.key}
            icon={it.icon}
            label={it.label}
            accent={it.accent}
            soft={it.soft}
            onPress={it.onPress}
            accessibilityLabel={it.a11y}
            accessibilityHint={it.hint}
          />
        ))}
      </View>
    </Card>
  );
}

/* ---------------------------------- Move ---------------------------------- */

export function MoveCard({
  activity,
  loading,
  plan,
  stepGoal,
  showSteps,
}: {
  activity: MetricResult<ActivityToday> | null;
  loading: boolean;
  plan: PlanState | null;
  stepGoal: number;
  showSteps: boolean;
}) {
  const { c } = useTheme();
  const { availability, granted, demoMode } = useAppState();
  const sensor = useStepSensor();
  const [details, setDetails] = useState(false);
  const steps = activity?.status === 'ok' && activity.data ? activity.data.steps : null;
  const minutes = plan?.activityMinutes ?? 0;
  const kcal = Math.round(plan?.exerciseKcal ?? 0);
  const hcSteps = availability === 'available' && granted.has('Steps');
  const needsSensor = showSteps && !demoMode && !hcSteps && sensor.permission !== 'granted' && sensor.permission !== 'unavailable';

  if (showSteps && loading && !activity) return <CompactSkeleton label="Move" />;

  const pct = steps !== null ? Math.round((steps / stepGoal) * 100) : 0;
  const stepsText = steps !== null ? `${steps.toLocaleString()} steps of ${stepGoal.toLocaleString()} goal, ${pct} percent` : 'No steps yet today';
  const label = `Move today. ${showSteps ? stepsText + '. ' : ''}${minutes} active minutes logged, about ${kcal} kilocalories extra burn.`;

  return (
    <>
      <Card>
        <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          {showSteps ? (
            <Ring value={steps ?? 0} goal={stepGoal} size={76} stroke={9} color={c.steps} track={c.stepsSoft} accessibilityLabel={stepsText}>
              <Footprints size={20} color={c.steps} />
            </Ring>
          ) : null}
          <View style={{ flex: 1, gap: space.xxs }}>
            {showSteps ? (
              <View>
                <Text variant="displaySm">{steps !== null ? steps.toLocaleString() : '—'}</Text>
                <Text variant="caption" tone="muted">
                  {steps !== null ? `steps · ${pct}% of ${stepGoal.toLocaleString()}` : 'No steps yet today'}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Activity size={16} color={c.heart} />
              <Text>
                <Text variant="bodyStrong">{minutes} min</Text>
                <Text tone="muted"> active{kcal > 0 ? ` · ~${kcal} kcal extra` : ''}</Text>
              </Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, marginTop: space.xs }}>
          {needsSensor ? (
            <TextButton
              label="Count steps with this phone"
              icon={Footprints}
              onPress={() => sensor.request()}
              accessibilityHint="Asks for physical activity permission so Bloom can count steps while it's open"
            />
          ) : null}
          <TextButton label="See activity" onPress={() => router.push('/activity')} accessibilityHint="Opens today's activities" />
          {showSteps ? (
            <TextButton
              label={details ? 'Hide step details' : 'Step details'}
              onPress={() => setDetails((v) => !v)}
              accessibilityState={{ expanded: details }}
            />
          ) : null}
        </View>
      </Card>
      {details && showSteps ? <ActivityCard loading={loading} result={activity} goal={stepGoal} /> : null}
    </>
  );
}

/* ------------------------------ Sleep & heart ----------------------------- */

export function SleepHeartCard({
  sleep,
  heart,
  spo2,
  loading,
  showSleep,
  showHeart,
}: {
  sleep: MetricResult<SleepNight> | null;
  heart: MetricResult<HeartToday> | null;
  spo2: MetricResult<Spo2Latest> | null;
  loading: { sleep: boolean; heart: boolean; spo2: boolean };
  showSleep: boolean;
  showHeart: boolean;
}) {
  const { c } = useTheme();
  const { open } = useLogSheets();
  const [details, setDetails] = useState(false);
  if ((showSleep && loading.sleep && !sleep) || (showHeart && loading.heart && !heart)) return <CompactSkeleton label="Sleep and heart" />;

  const s = sleep?.status === 'ok' ? sleep.data : null;
  const h = heart?.status === 'ok' ? heart.data : null;
  const o = spo2?.status === 'ok' ? spo2.data : null;
  const bpm = h ? (h.restingBpm ?? h.latest?.bpm ?? null) : null;
  const bpmKind = h?.restingBpm != null ? 'resting' : 'latest';
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {showSleep ? (
            <MiniStat
              icon={Moon}
              accent={c.sleep}
              soft={c.sleepSoft}
              label="Sleep"
              value={s ? formatDuration(s.asleepMin) : '—'}
              sub={s ? `${time(s.start)} – ${time(s.end)}` : 'Not logged last night'}
              a11y={s ? `Last night's sleep: ${formatDuration(s.asleepMin)}, ${time(s.start)} to ${time(s.end)}${s.quality ? `, quality ${s.quality} of 5` : ''}.` : 'No sleep logged for last night.'}
            />
          ) : null}
          {showHeart ? (
            <MiniStat
              icon={HeartPulse}
              accent={c.heart}
              soft={c.heartSoft}
              label="Heart"
              value={bpm !== null ? String(bpm) : '—'}
              unit={bpm !== null ? 'bpm' : undefined}
              sub={
                bpm !== null
                  ? `${bpmKind}${o ? ` · SpO₂ ${o.percent}%` : ''}`
                  : o
                    ? `SpO₂ ${o.percent}%`
                    : 'No readings today'
              }
              a11y={`Heart rate: ${bpm !== null ? `${bpm} beats per minute, ${bpmKind}` : 'no readings today'}.${o ? ` Blood oxygen ${o.percent} percent.` : ''}`}
            />
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, marginTop: space.xs }}>
          {showSleep ? <TextButton label="Log sleep" icon={Plus} onPress={() => open('sleep')} /> : null}
          {showHeart ? <TextButton label="Add reading" icon={Plus} onPress={() => open('reading')} accessibilityLabel="Add heart rate or SpO₂ reading" /> : null}
          <TextButton
            label={details ? 'Hide details' : 'Details'}
            onPress={() => setDetails((v) => !v)}
            accessibilityLabel={details ? 'Hide sleep and heart details' : 'Show sleep and heart details'}
            accessibilityState={{ expanded: details }}
          />
        </View>
      </Card>
      {details ? (
        <>
          {showSleep ? <SleepCard loading={loading.sleep} result={sleep} /> : null}
          {showHeart ? <HeartCard loading={loading.heart} result={heart} /> : null}
          {showHeart ? <Spo2Card loading={loading.spo2} result={spo2} /> : null}
        </>
      ) : null}
    </>
  );
}

function MiniStat({
  icon: Icon,
  accent,
  soft,
  label,
  value,
  unit,
  sub,
  a11y,
}: {
  icon: LucideIcon;
  accent: string;
  soft: string;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  a11y: string;
}) {
  return (
    <View accessible accessibilityLabel={a11y} style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} color={accent} strokeWidth={2.4} />
        </View>
        <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }}>
          {label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text variant="displaySm">{value}</Text>
        {unit ? (
          <Text variant="caption" tone="muted">
            {unit}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" tone="muted">
        {sub}
      </Text>
    </View>
  );
}

function CompactSkeleton({ label }: { label: string }) {
  return (
    <Card accessibilityLabel={`Loading ${label}`}>
      <Skeleton height={56} />
    </Card>
  );
}

/* -------------------------------- Ask Bloom -------------------------------- */

export function AskBloomCard() {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/coach')}
      accessibilityRole="button"
      accessibilityLabel="Ask Bloom, your AI coach"
      accessibilityHint="Opens a chat that explains your data in plain language"
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: touch.min + 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.card,
        backgroundColor: c.sleepSoft,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Sparkles size={20} color={c.sleep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">Ask Bloom</Text>
        <Text variant="caption" tone="muted">
          Morning brief, weekly review or any question
        </Text>
      </View>
      <ChevronRight size={20} color={c.muted} />
    </Pressable>
  );
}

/* ----------------------------- Customise Today ---------------------------- */

export function CustomiseTodaySheet({
  visible,
  hidden,
  onChange,
  onClose,
}: {
  visible: boolean;
  hidden: TodaySectionId[];
  onChange: (hidden: TodaySectionId[]) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  return (
    <Sheet visible={visible} title="Customise Today" onClose={onClose}>
      <Text tone="muted">Choose which sections Today shows. Quick log always stays. Areas you don’t track (Settings → What you track) stay hidden.</Text>
      <View>
        {TODAY_SECTIONS.map((s, i) => {
          const on = !hidden.includes(s.id);
          return (
            <View
              key={s.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                minHeight: 56,
                paddingVertical: space.xs,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: c.line,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{s.label}</Text>
                <Text variant="caption" tone="muted">
                  {s.hint}
                </Text>
              </View>
              <Switch
                value={on}
                onValueChange={(v) => onChange(v ? hidden.filter((x) => x !== s.id) : [...hidden, s.id])}
                accessibilityLabel={`Show ${s.label} on Today`}
                trackColor={{ false: c.line, true: c.sleep }}
                thumbColor={c.surface}
                style={{ minWidth: 48, minHeight: 48 }}
              />
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
