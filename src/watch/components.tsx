/**
 * Small direct-watch UI pieces: signal bars, a live sparkline and a status chip that other
 * screens (Today, Settings) can drop in.
 */
import { router } from 'expo-router';
import { Bluetooth, BluetoothConnected, BluetoothSearching } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '../components/ui';
import { radius, space, touch } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { rssiToSignal } from './parse';
import { useWatch } from './useWatch';

/** Four bars + the signal word (never colour alone). */
export function SignalBars({ rssi }: { rssi: number | null }) {
  const { c } = useTheme();
  const { bars, label } = rssiToSignal(rssi);
  return (
    <View
      accessible
      accessibilityLabel={`Signal ${label.toLowerCase()}${rssi != null ? `, ${rssi} dBm` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 }} importantForAccessibility="no-hide-descendants">
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={{
              width: 4,
              height: 4 + i * 3,
              borderRadius: 2,
              backgroundColor: i <= bars ? c.ink : c.line,
            }}
          />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/** Lightweight live sparkline (no draw-in animation, so it stays calm at 1 Hz updates). */
export function LiveSparkline({ values, width, height = 56, color }: { values: number[]; width: number; height?: number; color: string }) {
  if (values.length < 2 || width <= 0) return <View style={{ width, height }} />;
  const lo = Math.min(...values) - 2;
  const hi = Math.max(...values) + 2;
  const span = Math.max(1, hi - lo);
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, 4 + (height - 8) * (1 - (v - lo) / span)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <Svg width={width} height={height} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Path d={d} stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={lx} cy={ly} r={4} fill={color} />
    </Svg>
  );
}

/**
 * "Watch: connected · 72 bpm" chip. Renders nothing unless a watch was connected directly
 * before (so screens can include it unconditionally). Tapping opens the Watch screen.
 */
export function WatchStatusChip() {
  const { c } = useTheme();
  const w = useWatch();
  if (!w.remembered) return null;
  const connected = w.phase === 'connected' && w.connected;
  const bpm = connected && w.live?.usable ? `${w.live.bpm} bpm` : null;
  const label = connected
    ? `Watch connected${bpm ? ` · ${bpm}` : ''}`
    : w.phase === 'reconnecting' || w.phase === 'connecting'
      ? 'Watch reconnecting…'
      : 'Watch not connected';
  const Icon = connected ? BluetoothConnected : w.phase === 'reconnecting' || w.phase === 'connecting' ? BluetoothSearching : Bluetooth;
  return (
    <Pressable
      onPress={() => router.push('/watch')}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${w.remembered.name}`}
      accessibilityHint="Opens the watch screen"
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        minHeight: touch.min,
        paddingHorizontal: space.sm,
        borderRadius: radius.chip,
        backgroundColor: connected ? c.heartSoft : c.surfaceAlt,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon size={16} color={connected ? c.heart : c.muted} />
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}
