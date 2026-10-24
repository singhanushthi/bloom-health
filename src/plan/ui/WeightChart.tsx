/**
 * Weight chart: filled dots = morning weights, hollow dots = night weights (optional),
 * solid line = 7-day morning trend, dashed line = target. Meaning is carried by shape and
 * line style as well as colour; the legend repeats it in words.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { Text } from '../../components/ui';
import { useProgress } from '../../hooks/useProgress';
import { addDays, type DayKey } from '../../health/dates';
import { fonts, space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { trendSeries, type WeightPoint } from '../trend';
import { formatShortDay } from './parts';

export function WeightChart({
  points,
  today,
  days = 42,
  targetKg,
  showNight,
  width,
  height = 200,
}: {
  points: WeightPoint[];
  today: DayKey;
  days?: number;
  targetKg: number | null;
  showNight: boolean;
  width: number;
  height?: number;
}) {
  const { c } = useTheme();
  const range = Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));
  const inRange = points.filter((p) => p.day >= range[0] && p.day <= today);
  const mornings = inRange.filter((p) => p.slot === 'morning');
  const nights = inRange.filter((p) => p.slot === 'night');
  const trend = trendSeries(points, range);
  const p = useProgress(`${inRange.length}-${today}-${targetKg}`);

  const vals = [...mornings.map((m) => m.kg), ...(showNight ? nights.map((n) => n.kg) : []), ...trend.filter((t): t is number => t !== null)];
  if (targetKg !== null && vals.length) vals.push(targetKg);
  const lo = vals.length ? Math.floor(Math.min(...vals) - 0.5) : 50;
  const hi = vals.length ? Math.ceil(Math.max(...vals) + 0.5) : 80;
  const span = Math.max(2, hi - lo);
  const padL = 40;
  const padR = 10;
  const padT = 14;
  const padB = 24;
  const plotW = Math.max(10, width - padL - padR);
  const plotH = height - padT - padB;
  const x = (day: DayKey) => padL + (range.indexOf(day) / Math.max(1, days - 1)) * plotW;
  const y = (kg: number) => padT + plotH - ((kg - lo) / span) * plotH;
  const ticks = [lo, lo + span / 2, hi];

  let d = '';
  trend.forEach((t, i) => {
    if (t === null) return;
    d += `${d ? 'L' : 'M'}${x(range[i]).toFixed(1)},${y(t).toFixed(1)} `;
  });

  const lastTrend = [...trend].reverse().find((t) => t !== null) ?? null;
  const label = !mornings.length && !nights.length
    ? 'Weight chart: no weights in the last six weeks yet.'
    : `Weight chart, last ${days} days. ${mornings.length} morning weigh-ins${showNight ? ` and ${nights.length} night weigh-ins` : ''}. ${
        lastTrend !== null ? `Trend now ${lastTrend.toFixed(1)} kilograms.` : ''
      }${targetKg !== null ? ` Target ${targetKg.toFixed(1)} kilograms.` : ''}`;

  return (
    <View style={{ gap: space.xs }}>
      <View accessible accessibilityRole="image" accessibilityLabel={label}>
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <G key={t}>
              <Line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={c.line} strokeWidth={1} />
              <SvgText x={padL - 6} y={y(t) + 4} fontSize={12} fill={c.muted} textAnchor="end" fontFamily={fonts.medium}>
                {t.toFixed(t % 1 ? 1 : 0)}
              </SvgText>
            </G>
          ))}
          {targetKg !== null && targetKg >= lo && targetKg <= hi ? (
            <G>
              <Line x1={padL} x2={width - padR} y1={y(targetKg)} y2={y(targetKg)} stroke={c.ink} strokeWidth={1.5} strokeDasharray="6 5" />
              <SvgText x={width - padR} y={y(targetKg) - 5} fontSize={12} fill={c.ink} textAnchor="end" fontFamily={fonts.semibold}>
                Target
              </SvgText>
            </G>
          ) : null}
          {showNight
            ? nights.map((n, i) => (
                <Circle key={`n${i}`} cx={x(n.day)} cy={y(n.kg)} r={3.5} fill={c.surface} stroke={c.muted} strokeWidth={1.5} opacity={p} />
              ))
            : null}
          {mornings.map((m, i) => (
            <Circle key={`m${i}`} cx={x(m.day)} cy={y(m.kg)} r={3.5} fill={c.spo2} opacity={0.55 * p} />
          ))}
          {d ? <Path d={d} stroke={c.spo2} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" opacity={p} /> : null}
          {[range[0], range[Math.floor(days / 2)], today].map((day) => (
            <SvgText key={day} x={x(day)} y={height - 6} fontSize={12} fill={c.muted} textAnchor="middle" fontFamily={fonts.medium}>
              {formatShortDay(day)}
            </SvgText>
          ))}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }} importantForAccessibility="no-hide-descendants">
        <Legend kind="dot" label="Morning" />
        <Legend kind="line" label="7-day trend" />
        {targetKg !== null ? <Legend kind="dash" label="Target" /> : null}
        {showNight ? <Legend kind="ring" label="Night" /> : null}
      </View>
    </View>
  );
}

function Legend({ kind, label }: { kind: 'dot' | 'line' | 'dash' | 'ring'; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Svg width={22} height={12}>
        {kind === 'dot' ? <Circle cx={11} cy={6} r={4} fill={c.spo2} opacity={0.6} /> : null}
        {kind === 'ring' ? <Circle cx={11} cy={6} r={4} fill={c.surface} stroke={c.muted} strokeWidth={1.5} /> : null}
        {kind === 'line' ? <Line x1={1} x2={21} y1={6} y2={6} stroke={c.spo2} strokeWidth={3} strokeLinecap="round" /> : null}
        {kind === 'dash' ? <Line x1={1} x2={21} y1={6} y2={6} stroke={c.ink} strokeWidth={1.5} strokeDasharray="5 4" /> : null}
      </Svg>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}
