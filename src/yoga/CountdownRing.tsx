import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/useTheme';

/** Circular countdown: the arc shrinks as time runs out. */
export function CountdownRing({
  fraction,
  size = 260,
  stroke = 10,
  color,
  children,
  accessibilityLabel,
}: {
  /** 0–1 share of time remaining. */
  fraction: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
  accessibilityLabel: string;
}) {
  const { c } = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? c.cycle}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ * f} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
