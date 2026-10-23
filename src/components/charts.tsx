/**
 * Hand-built SVG charts (react-native-svg). Every chart:
 *  - is wrapped in an accessible View with a value summary (accessibilityLabel),
 *  - draws axis labels as text (ink/muted colours),
 *  - animates 150–300ms unless reduced motion is on.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useProgress } from '../hooks/useProgress';
import { fonts } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/* --------------------------------- Ring --------------------------------- */

export function Ring({
  value,
  goal,
  size = 132,
  stroke = 14,
  color,
  track,
  children,
  accessibilityLabel,
}: {
  value: number;
  goal: number;
  size?: number;
  stroke?: number;
  color: string;
  track: string;
  children?: React.ReactNode;
  accessibilityLabel: string;
}) {
  const p = useProgress(`${value}/${goal}`);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = goal > 0 ? Math.min(1, value / goal) : 0;
  const dash = circ * frac * p;
  const done = value >= goal && goal > 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: goal, now: Math.min(value, goal) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {done ? (
          // Goal reached: a second, thin outer ring — meaning doesn't rely on colour alone.
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 1.5}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="3 4"
            fill="none"
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

/* ------------------------------- Bar chart ------------------------------ */

export interface BarDatum {
  label: string;
  value: number | null;
  /** Show the x label (to thin out 30-day axes). */
  showLabel?: boolean;
  highlight?: boolean;
}

export function BarChart({
  data,
  color,
  softColor,
  height = 180,
  width,
  goal,
  goalLabel,
  formatY,
  yAxisTitle,
  accessibilityLabel,
}: {
  data: BarDatum[];
  color: string;
  softColor: string;
  height?: number;
  width: number;
  goal?: number;
  goalLabel?: string;
  formatY: (v: number) => string;
  yAxisTitle: string;
  accessibilityLabel: string;
}) {
  const { c } = useTheme();
  const p = useProgress(data.map((d) => d.value).join(','));
  const padL = 44;
  const padR = 8;
  const padT = 22;
  const padB = 26;
  const plotW = Math.max(10, width - padL - padR);
  const plotH = height - padT - padB;
  const vals = data.map((d) => d.value ?? 0);
  const max = niceMax(Math.max(goal ?? 0, ...vals, 1));
  const ticks = [0, max / 2, max];
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(28, slot * 0.62));
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        <SvgText x={0} y={12} fontSize={12} fill={c.muted} fontFamily={fonts.medium}>
          {yAxisTitle}
        </SvgText>
        {ticks.map((t) => (
          <G key={t}>
            <Line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={c.line} strokeWidth={1} />
            <SvgText
              x={padL - 6}
              y={y(t) + 4}
              fontSize={12}
              fill={c.muted}
              textAnchor="end"
              fontFamily={fonts.medium}
            >
              {formatY(t)}
            </SvgText>
          </G>
        ))}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const v = d.value ?? 0;
          const h = (v / max) * plotH * p;
          return (
            <G key={i}>
              {d.value === null ? (
                // No data: small hollow marker so gaps are distinguishable from zero.
                <Rect
                  x={cx - barW / 2}
                  y={padT + plotH - 4}
                  width={barW}
                  height={4}
                  rx={2}
                  fill="none"
                  stroke={c.muted}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              ) : (
                <Rect
                  x={cx - barW / 2}
                  y={padT + plotH - h}
                  width={barW}
                  height={Math.max(h, v > 0 ? 2 : 0)}
                  rx={Math.min(6, barW / 2)}
                  fill={d.highlight ? color : softColor}
                  stroke={color}
                  strokeWidth={d.highlight ? 0 : 1}
                />
              )}
              {d.showLabel !== false ? (
                <SvgText
                  x={cx}
                  y={height - 8}
                  fontSize={12}
                  fill={d.highlight ? c.ink : c.muted}
                  textAnchor="middle"
                  fontFamily={d.highlight ? fonts.bold : fonts.medium}
                >
                  {d.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        {goal ? (
          <G>
            <Line
              x1={padL}
              x2={width - padR}
              y1={y(goal)}
              y2={y(goal)}
              stroke={c.ink}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            {goalLabel ? (
              <SvgText
                x={width - padR}
                y={y(goal) - 5}
                fontSize={12}
                fill={c.ink}
                textAnchor="end"
                fontFamily={fonts.semibold}
              >
                {goalLabel}
              </SvgText>
            ) : null}
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

/* ------------------------------ Line chart ------------------------------ */

export function LineChart({
  data,
  color,
  width,
  height = 170,
  formatY,
  yAxisTitle,
  accessibilityLabel,
}: {
  data: BarDatum[];
  color: string;
  width: number;
  height?: number;
  formatY: (v: number) => string;
  yAxisTitle: string;
  accessibilityLabel: string;
}) {
  const { c } = useTheme();
  const p = useProgress(data.map((d) => d.value).join(','));
  const padL = 44;
  const padR = 10;
  const padT = 22;
  const padB = 26;
  const plotW = Math.max(10, width - padL - padR);
  const plotH = height - padT - padB;
  const present = data.map((d) => d.value).filter((v): v is number => v !== null);
  const lo = present.length ? Math.floor((Math.min(...present) - 3) / 5) * 5 : 50;
  const hi = present.length ? Math.ceil((Math.max(...present) + 3) / 5) * 5 : 80;
  const span = Math.max(5, hi - lo);
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;
  const x = (i: number) => padL + (data.length > 1 ? i * step : plotW / 2);
  const y = (v: number) => padT + plotH - ((v - lo) / span) * plotH;
  const ticks = [lo, lo + span / 2, lo + span];

  // Build path segments, breaking at missing days.
  const segments: string[] = [];
  let current = '';
  data.forEach((d, i) => {
    if (d.value === null) {
      if (current) segments.push(current);
      current = '';
      return;
    }
    current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)} `;
  });
  if (current) segments.push(current);

  // Reveal left→right
  const clipW = padL + plotW * p + 6;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        <SvgText x={0} y={12} fontSize={12} fill={c.muted} fontFamily={fonts.medium}>
          {yAxisTitle}
        </SvgText>
        {ticks.map((t) => (
          <G key={t}>
            <Line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={c.line} strokeWidth={1} />
            <SvgText
              x={padL - 6}
              y={y(t) + 4}
              fontSize={12}
              fill={c.muted}
              textAnchor="end"
              fontFamily={fonts.medium}
            >
              {formatY(t)}
            </SvgText>
          </G>
        ))}
        <G>
          {segments.map((d, i) => (
            <Path
              key={i}
              d={d}
              stroke={color}
              strokeWidth={2.5}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={`${clipW * 3} ${clipW * 3}`}
              strokeDashoffset={(1 - p) * clipW * 3}
            />
          ))}
          {data.map((d, i) =>
            d.value === null ? null : (
              <Circle
                key={i}
                cx={x(i)}
                cy={y(d.value)}
                r={data.length > 10 ? 2.5 : 4}
                fill={c.surface}
                stroke={color}
                strokeWidth={2}
                opacity={p}
              />
            )
          )}
        </G>
        {data.map((d, i) =>
          d.showLabel !== false ? (
            <SvgText
              key={i}
              x={x(i)}
              y={height - 8}
              fontSize={12}
              fill={d.highlight ? c.ink : c.muted}
              textAnchor="middle"
              fontFamily={d.highlight ? fonts.bold : fonts.medium}
            >
              {d.label}
            </SvgText>
          ) : null
        )}
      </Svg>
    </View>
  );
}

/* ------------------------------- Sparkline ------------------------------ */

export function Sparkline({
  values,
  color,
  width,
  height = 44,
}: {
  values: (number | null)[];
  color: string;
  width: number;
  height?: number;
}) {
  const p = useProgress(values.join(','));
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return <View style={{ width, height }} />;
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const span = Math.max(1, hi - lo);
  const step = width / Math.max(1, values.length - 1);
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    const px = i * step;
    const py = 4 + (height - 8) * (1 - (v - lo) / span);
    d += `${pen ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)} `;
    pen = true;
  });
  const len = width * 3;
  return (
    <Svg width={width} height={height} importantForAccessibility="no">
      <Path
        d={d}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${len} ${len}`}
        strokeDashoffset={(1 - p) * len}
      />
    </Svg>
  );
}

/* ---------------------------- Stacked stage bar ------------------------- */

export interface StageSegment {
  key: string;
  label: string;
  minutes: number;
  color: string;
  /** Pattern so stages are distinguishable without colour. */
  pattern: 'solid' | 'stripes' | 'dots' | 'hollow';
}

export function StageBar({ segments, width, height = 18 }: { segments: StageSegment[]; width: number; height?: number }) {
  const { c } = useTheme();
  const p = useProgress(segments.map((s) => s.minutes).join(','));
  const total = segments.reduce((a, s) => a + s.minutes, 0) || 1;
  let x = 0;
  const gap = 2;
  return (
    <Svg width={width} height={height} importantForAccessibility="no">
      {segments.map((s) => {
        const w = Math.max(0, (s.minutes / total) * width * p - gap);
        const node = (
          <G key={s.key}>
            <Rect
              x={x}
              y={0}
              width={w}
              height={height}
              rx={4}
              fill={s.pattern === 'hollow' ? c.surface : s.color}
              stroke={s.color}
              strokeWidth={s.pattern === 'hollow' ? 1.5 : 0}
            />
            {s.pattern === 'stripes'
              ? Array.from({ length: Math.floor(w / 6) }, (_, i) => (
                  <Line
                    key={i}
                    x1={x + i * 6 + 3}
                    x2={x + i * 6 + 3}
                    y1={3}
                    y2={height - 3}
                    stroke={c.surface}
                    strokeOpacity={0.55}
                    strokeWidth={1.5}
                  />
                ))
              : null}
            {s.pattern === 'dots'
              ? Array.from({ length: Math.floor(w / 7) }, (_, i) => (
                  <Circle key={i} cx={x + i * 7 + 4} cy={height / 2} r={1.6} fill={c.surface} fillOpacity={0.7} />
                ))
              : null}
          </G>
        );
        x += w + gap;
        return node;
      })}
    </Svg>
  );
}

/** Legend swatch matching StageBar patterns. */
export function PatternSwatch({ color, pattern, size = 14 }: { color: string; pattern: StageSegment['pattern']; size?: number }) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} importantForAccessibility="no">
      <Rect
        x={0.75}
        y={0.75}
        width={size - 1.5}
        height={size - 1.5}
        rx={3}
        fill={pattern === 'hollow' ? c.surface : color}
        stroke={color}
        strokeWidth={1.5}
      />
      {pattern === 'stripes' ? (
        <>
          <Line x1={5} x2={5} y1={3} y2={size - 3} stroke={c.surface} strokeOpacity={0.6} strokeWidth={1.5} />
          <Line x1={9.5} x2={9.5} y1={3} y2={size - 3} stroke={c.surface} strokeOpacity={0.6} strokeWidth={1.5} />
        </>
      ) : null}
      {pattern === 'dots' ? <Circle cx={size / 2} cy={size / 2} r={2} fill={c.surface} fillOpacity={0.8} /> : null}
    </Svg>
  );
}

function niceMax(v: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * exp;
}
