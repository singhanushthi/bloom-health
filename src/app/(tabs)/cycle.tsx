/**
 * Cycle: month calendar of logged and predicted period days + cycle history.
 * Period days come from Bloom's own logs, merged with Health Connect (e.g. Flo) when connected.
 * Tap any day (today or earlier) to open that day's log.
 *
 * Non-colour encoding:
 *  - Logged period day: filled circle + droplet icon.
 *  - Predicted period day: dashed outline circle (no fill) + small "dashed" legend.
 *  - Estimated ovulation window: dotted underline.
 *  - Today: bold number + ring.
 *  - Day with a symptom/mood log: small note-pen dot under the number.
 */
import { ChevronLeft, ChevronRight, CircleAlert, Droplet, Flower2, Info, Lock, NotebookPen } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SourceTag } from '../../components/cards';
import { useLogSheets } from '../../components/sheets/LogSheets';
import Svg, { Circle, Line } from 'react-native-svg';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { Button, Card, CardHeader, CardSkeleton, EmptyNote, IconButton, Text } from '../../components/ui';
import { getCycleStatus, PHASE_LABEL } from '../../health';
import { addDays, formatDay, todayKey, type DayKey } from '../../health/dates';
import { useMetric } from '../../hooks/useMetric';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const pad = (n: number) => String(n).padStart(2, '0');

function monthGrid(year: number, month: number): (DayKey | null)[] {
  const first = new Date(year, month, 1);
  // Monday-first week
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(year, month + 1, 0).getDate();
  const cells: (DayKey | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysIn; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function CycleScreen() {
  const { c } = useTheme();
  const { loading, result, reload } = useMetric(getCycleStatus);
  const { open } = useLogSheets();
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const today = todayKey();

  const d = result?.data;
  const logged = useMemo(() => new Set(d?.periods.flatMap((p) => spanDays(p.start, p.end)) ?? []), [d]);
  const predicted = useMemo(() => new Set(d?.predictedDays ?? []), [d]);
  const fertile = useMemo(() => new Set(d?.predictedFertileDays ?? []), [d]);
  const noted = useMemo(() => new Set(d?.loggedDays ?? []), [d]);

  const cells = monthGrid(cursor.y, cursor.m);
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shift = (delta: number) =>
    setCursor(({ y, m }) => {
      const nm = m + delta;
      return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const cellSize = 44;
  const sourceOf = (start: DayKey) => {
    const p = d?.sourcedPeriods.find((x) => x.start === start);
    if (!p) return '';
    return p.sources.map((s) => (s === 'local' ? 'Logged in Bloom' : 'Health Connect')).join(' + ');
  };

  const calendar = (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
        <IconButton icon={ChevronLeft} onPress={() => shift(-1)} accessibilityLabel="Previous month" />
        <Text variant="heading" accessibilityRole="header" accessibilityLiveRegion="polite">
          {monthLabel}
        </Text>
        <IconButton icon={ChevronRight} onPress={() => shift(1)} accessibilityLabel="Next month" />
      </View>
      <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((w, i) => (
          <Text key={i} variant="label" tone="muted" style={{ flex: 1, textAlign: 'center' }}>
            {w}
          </Text>
        ))}
      </View>
      <View style={{ marginTop: space.xs }}>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <View key={row} style={{ flexDirection: 'row' }}>
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              if (!day) return <View key={col} style={{ flex: 1, height: cellSize + 4 }} />;
              const isLogged = logged.has(day);
              const isPred = !isLogged && predicted.has(day);
              const isFertile = !isLogged && !isPred && fertile.has(day);
              const isToday = day === today;
              const isFuture = day > today;
              const hasNote = noted.has(day);
              const num = Number(day.slice(8));
              const parts = [
                `${WEEKDAY_NAMES[col]} ${formatDay(day, { day: 'numeric', month: 'long' })}`,
                isToday ? 'today' : '',
                isLogged ? 'period day, logged' : '',
                isPred ? 'predicted period day, estimate' : '',
                isFertile ? 'estimated ovulation window' : '',
                hasNote ? 'has a day log' : '',
              ].filter(Boolean);
              return (
                <Pressable
                  key={col}
                  disabled={isFuture}
                  onPress={() => open('day', { day })}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isFuture }}
                  accessibilityLabel={parts.join(', ')}
                  accessibilityHint={isFuture ? undefined : 'Opens the log for this day'}
                  android_ripple={{ color: c.line, borderless: true, radius: 22 }}
                  style={{ flex: 1, height: cellSize + 4, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={{ width: cellSize, height: cellSize, alignItems: 'center', justifyContent: 'center' }}>
                    <Svg width={cellSize} height={cellSize} style={{ position: 'absolute' }}>
                      {isLogged ? (
                        <Circle cx={22} cy={22} r={18} fill={c.cycleSoft} stroke={c.cycle} strokeWidth={2.5} />
                      ) : null}
                      {isPred ? (
                        <Circle cx={22} cy={22} r={18} fill="none" stroke={c.cycle} strokeWidth={2} strokeDasharray="4 3" />
                      ) : null}
                      {isToday && !isLogged ? (
                        <Circle cx={22} cy={22} r={20} fill="none" stroke={c.ink} strokeWidth={1.5} />
                      ) : null}
                      {isToday && isLogged ? (
                        <Circle cx={22} cy={22} r={21} fill="none" stroke={c.ink} strokeWidth={2} />
                      ) : null}
                      {isFertile ? (
                        <Line x1={12} x2={32} y1={37} y2={37} stroke={c.spo2} strokeWidth={2.5} strokeDasharray="2 3" strokeLinecap="round" />
                      ) : null}
                    </Svg>
                    <Text variant={isToday || isLogged ? 'bodyStrong' : 'body'}>{num}</Text>
                    {isLogged ? (
                      <View style={{ position: 'absolute', top: 1, right: 1 }}>
                        <Droplet size={12} color={c.cycle} fill={c.cycle} />
                      </View>
                    ) : null}
                    {hasNote ? (
                      <View style={{ position: 'absolute', bottom: 0, left: 2 }}>
                        <NotebookPen size={11} color={c.ink} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Legend />
      <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
        Tap a day to log flow, symptoms, mood or a note.
      </Text>
    </Card>
  );

  const logButton = (
    <Button label="Log period" icon={Droplet} onPress={() => open('period')} />
  );

  const body = () => {
    if (loading && !result) return <CardSkeleton label="cycle calendar" height={420} />;
    if (!result) return null;
    if (result.status !== 'ok' || !d) {
      return (
        <>
          <Card>
            <EmptyNote
              icon={result.status === 'denied' ? Lock : CircleAlert}
              accent={c.cycle}
              title={result.status === 'denied' ? 'Permission needed' : result.status === 'error' ? "Couldn't read cycle data" : 'No period logged yet'}
              body={
                result.status === 'denied'
                  ? 'Allow Menstruation in Settings → Health Connect → Manage permissions.'
                  : result.status === 'error'
                    ? `Pull down to retry. ${result.error ?? ''}`
                    : 'Log your last period to see your cycle day and an estimate of the next one. If you use Flo, you can also connect it in Settings.'
              }
            />
          </Card>
          {logButton}
          {calendar}
        </>
      );
    }

    return (
      <>
        <Card tint={c.cycleSoft}>
          <CardHeader icon={Flower2} label="Summary" accent={c.cycle} soft={c.surface} />
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <Metric label="Avg cycle" value={`${d.averageCycleLength}`} unit="days" />
            <Metric label="Avg period" value={`${d.averagePeriodLength}`} unit="days" />
            <Metric label="Phase" value={d.phase ? PHASE_LABEL[d.phase].split(' ')[0] : '—'} unit={d.cycleDay ? `day ${d.cycleDay}` : ''} />
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
            Predictions are estimates from {d.usedDefault ? 'a default 28-day cycle (log 2+ cycles for a personal average)' : `your last ${d.cyclesUsed} cycles`}. Not for contraception or medical use.
          </Text>
          <SourceTag sources={result.sources} fallback="Logged in Bloom" />
        </Card>

        {logButton}

        {calendar}

        {d.partialHistory ? (
          <Card tint={c.stepsSoft}>
            <EmptyNote
              icon={Info}
              accent={c.steps}
              title="Only recent history available"
              body="Allow “Access past data” for Bloom in Health Connect to include cycles older than 30 days."
            />
          </Card>
        ) : null}

        <Card>
          <CardHeader icon={Droplet} label="Cycle history" accent={c.cycle} soft={c.cycleSoft} />
          {d.history.slice(0, 12).map((h, i) => (
            <View
              key={h.start}
              accessible
              accessibilityLabel={`Cycle starting ${formatDay(h.start, { day: 'numeric', month: 'long', year: 'numeric' })}${sourceOf(h.start) ? `, ${sourceOf(h.start)}` : ''}. ${
                h.cycleLength === null ? 'Current cycle' : `${h.cycleLength} day cycle${h.counted ? '' : ', excluded from average as unusual'}`
              }. Period ${h.periodLength} days.`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 52,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.line,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{formatDay(h.start, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                <Text variant="caption" tone="muted">
                  Period {h.periodLength} {h.periodLength === 1 ? 'day' : 'days'}
                  {sourceOf(h.start) ? ` · ${sourceOf(h.start)}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="bodyStrong">{h.cycleLength === null ? 'Current' : `${h.cycleLength} days`}</Text>
                {h.cycleLength !== null && !h.counted ? (
                  <Text variant="caption" tone="muted">
                    not averaged
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      </>
    );
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Text variant="display" accessibilityRole="header">
        Cycle
      </Text>
      <DemoBanner />
      {body()}
    </Screen>
  );
}

function spanDays(start: DayKey, end: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value} ${unit}`}>
      <Text variant="label" tone="muted">
        {label.toUpperCase()}
      </Text>
      <Text variant="displaySm">{value}</Text>
      <Text variant="caption" tone="muted">
        {unit}
      </Text>
    </View>
  );
}

function Legend() {
  const { c } = useTheme();
  const item = (icon: React.ReactNode, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon}
      <Text variant="caption">{label}</Text>
    </View>
  );
  return (
    <View
      accessible
      accessibilityLabel="Legend: solid filled circle with a droplet means a logged period day. Dashed circle means a predicted period day. Dotted underline means the estimated ovulation window. Outlined number is today. A small note icon means you logged symptoms, mood or a note."
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md }}
    >
      {item(
        <Svg width={18} height={18}>
          <Circle cx={9} cy={9} r={7.5} fill={c.cycleSoft} stroke={c.cycle} strokeWidth={2} />
        </Svg>,
        'Logged (with droplet)'
      )}
      {item(
        <Svg width={18} height={18}>
          <Circle cx={9} cy={9} r={7.5} fill="none" stroke={c.cycle} strokeWidth={2} strokeDasharray="3 2.5" />
        </Svg>,
        'Predicted (estimate)'
      )}
      {item(
        <Svg width={18} height={18}>
          <Line x1={2} x2={16} y1={14} y2={14} stroke={c.spo2} strokeWidth={2.5} strokeDasharray="2 3" strokeLinecap="round" />
        </Svg>,
        'Ovulation window'
      )}
      {item(
        <Svg width={18} height={18}>
          <Circle cx={9} cy={9} r={8} fill="none" stroke={c.ink} strokeWidth={1.5} />
        </Svg>,
        'Today'
      )}
      {item(<NotebookPen size={14} color={c.ink} />, 'Day log')}
    </View>
  );
}
