/**
 * Month calendar for the Cycle tab. Meaning never relies on colour alone:
 *  - Logged period day: filled circle + droplet icon.
 *  - Predicted period day: dashed circle. Possible (irregular range): dotted circle.
 *  - Fertile window: dotted underline. Estimated ovulation: small star.
 *  - PMS days: small hollow diamond. Today: ring + bold number. Day log: note icon.
 */
import { ChevronLeft, ChevronRight, Droplet, NotebookPen, Star } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import { Card, IconButton, Text } from '../components/ui';
import type { FullCycleResult } from '../health/cycle';
import { addDays, formatDay, type DayKey } from '../health/dates';
import { space } from '../theme/tokens';
import type { CycleGoal } from './store';
import { useCycleColors } from './theme';

const pad = (n: number) => String(n).padStart(2, '0');

export function monthGrid(year: number, month: number): (DayKey | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const daysIn = new Date(year, month + 1, 0).getDate();
  const cells: (DayKey | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysIn; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function spanDays(start: DayKey, end: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function fertileLabel(goal: CycleGoal): string {
  return goal === 'avoid' ? 'Higher-chance days (estimate)' : 'Fertile window (estimate)';
}

export function CycleCalendar({
  data,
  today,
  goal,
  onDayPress,
}: {
  data: FullCycleResult | null;
  today: DayKey;
  goal: CycleGoal;
  onDayPress: (day: DayKey) => void;
}) {
  const { c } = useCycleColors();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { y, m: m - 1 };
  });
  const p = data?.predictions;
  const sets = useMemo(
    () => ({
      logged: new Set(data?.periods.flatMap((x) => spanDays(x.start, x.end)) ?? []),
      predicted: new Set(p?.calendar.predicted ?? []),
      possible: new Set(p?.calendar.possible ?? []),
      fertile: new Set(p?.calendar.fertile ?? []),
      ovulation: new Set(p?.calendar.ovulation ?? []),
      pms: new Set(p?.calendar.pms ?? []),
      noted: new Set(data?.loggedDays ?? []),
    }),
    [data, p]
  );
  const emphasiseFertile = goal !== 'track';
  const cells = monthGrid(cursor.y, cursor.m);
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shift = (delta: number) =>
    setCursor(({ y, m }) => {
      const nm = m + delta;
      return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });
  const size = 44;

  return (
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
              if (!day) return <View key={col} style={{ flex: 1, height: size + 6 }} />;
              const isLogged = sets.logged.has(day);
              const isPred = !isLogged && sets.predicted.has(day);
              const isPossible = !isLogged && !isPred && sets.possible.has(day);
              const isFertile = !isLogged && sets.fertile.has(day);
              const isOv = !isLogged && sets.ovulation.has(day);
              const isPms = !isLogged && !isPred && sets.pms.has(day);
              const isToday = day === today;
              const isFuture = day > today;
              const hasNote = sets.noted.has(day);
              const parts = [
                `${WEEKDAY_NAMES[col]} ${formatDay(day, { day: 'numeric', month: 'long' })}`,
                isToday ? 'today' : '',
                isLogged ? 'period day, logged' : '',
                isPred ? 'predicted period day, estimate' : '',
                isPossible ? 'period could start around here, estimate' : '',
                isFertile ? fertileLabel(goal).toLowerCase() : '',
                isOv ? 'estimated ovulation' : '',
                isPms ? 'PMS days, estimate' : '',
                hasNote ? 'has a day log' : '',
              ].filter(Boolean);
              return (
                <Pressable
                  key={col}
                  disabled={isFuture}
                  onPress={() => onDayPress(day)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isFuture }}
                  accessibilityLabel={parts.join(', ')}
                  accessibilityHint={isFuture ? undefined : 'Opens the log for this day'}
                  android_ripple={{ color: c.line, borderless: true, radius: 22 }}
                  style={{ flex: 1, height: size + 6, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                    <Svg width={size} height={size} style={{ position: 'absolute' }}>
                      {isLogged ? <Circle cx={22} cy={22} r={18} fill={c.cycleSoft} stroke={c.cycle} strokeWidth={2.5} /> : null}
                      {isPred ? <Circle cx={22} cy={22} r={18} fill="none" stroke={c.cycle} strokeWidth={2} strokeDasharray="4 3" /> : null}
                      {isPossible ? (
                        <Circle cx={22} cy={22} r={18} fill="none" stroke={c.cycle} strokeWidth={1.6} strokeDasharray="1 3.5" strokeLinecap="round" />
                      ) : null}
                      {isToday ? <Circle cx={22} cy={22} r={isLogged ? 21 : 20.5} fill="none" stroke={c.ink} strokeWidth={isLogged ? 2 : 1.5} /> : null}
                      {isFertile ? (
                        <Line
                          x1={10}
                          x2={34}
                          y1={38}
                          y2={38}
                          stroke={c.spo2}
                          strokeWidth={emphasiseFertile ? 3.5 : 2.5}
                          strokeDasharray="2 3"
                          strokeLinecap="round"
                        />
                      ) : null}
                      {isPms ? <Polygon points="37,33 41,37 37,41 33,37" fill="none" stroke={c.cycle} strokeWidth={1.5} /> : null}
                    </Svg>
                    <Text variant={isToday || isLogged ? 'bodyStrong' : 'body'}>{Number(day.slice(8))}</Text>
                    {isLogged ? (
                      <View style={{ position: 'absolute', top: 0, right: 0 }}>
                        <Droplet size={12} color={c.cycle} fill={c.cycle} />
                      </View>
                    ) : null}
                    {isOv ? (
                      <View style={{ position: 'absolute', top: 0, left: 0 }}>
                        <Star size={12} color={c.spo2} fill={emphasiseFertile ? c.spo2 : 'none'} />
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
      <CalendarLegend goal={goal} showPossible={!!p?.irregular} />
      <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
        Tap a day to log flow, pain, symptoms, mood and more.
      </Text>
    </Card>
  );
}

export function CalendarLegend({ goal, showPossible }: { goal: CycleGoal; showPossible: boolean }) {
  const { c } = useCycleColors();
  const item = (icon: React.ReactNode, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 }}>
      {icon}
      <Text variant="caption">{label}</Text>
    </View>
  );
  const fertile = item(
    <Svg width={18} height={18}>
      <Line x1={2} x2={16} y1={14} y2={14} stroke={c.spo2} strokeWidth={2.5} strokeDasharray="2 3" strokeLinecap="round" />
    </Svg>,
    fertileLabel(goal)
  );
  const ovulation = item(<Star size={14} color={c.spo2} fill={goal !== 'track' ? c.spo2 : 'none'} />, 'Ovulation (estimate)');
  const label = [
    'Legend: filled circle with a droplet is a logged period day',
    'dashed circle is a predicted period day',
    showPossible ? 'dotted circle means your period could start around then' : '',
    `dotted underline is the ${fertileLabel(goal).toLowerCase()}`,
    'star is the estimated ovulation day',
    'small diamond marks PMS days',
    'ring is today',
    'note icon means you logged that day',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: space.xs, marginTop: space.md }}>
      {item(
        <Svg width={18} height={18}>
          <Circle cx={9} cy={9} r={7.5} fill={c.cycleSoft} stroke={c.cycle} strokeWidth={2} />
        </Svg>,
        'Period (logged)'
      )}
      {item(
        <Svg width={18} height={18}>
          <Circle cx={9} cy={9} r={7.5} fill="none" stroke={c.cycle} strokeWidth={2} strokeDasharray="3 2.5" />
        </Svg>,
        'Predicted (estimate)'
      )}
      {showPossible
        ? item(
            <Svg width={18} height={18}>
              <Circle cx={9} cy={9} r={7.5} fill="none" stroke={c.cycle} strokeWidth={1.6} strokeDasharray="1 3" strokeLinecap="round" />
            </Svg>,
            'Possible start'
          )
        : null}
      {goal !== 'track' ? ovulation : null}
      {goal !== 'track' ? fertile : null}
      {item(
        <Svg width={18} height={18}>
          <Polygon points="9,4 14,9 9,14 4,9" fill="none" stroke={c.cycle} strokeWidth={1.5} />
        </Svg>,
        'PMS days'
      )}
      {goal === 'track' ? fertile : null}
      {goal === 'track' ? ovulation : null}
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
