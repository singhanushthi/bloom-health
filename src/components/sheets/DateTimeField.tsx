/**
 * Date / time field that opens the native Android picker
 * (@react-native-community/datetimepicker 9.2.1 — the version Expo SDK 58 bundles).
 * Shown as a labelled, ≥44px button with the current value as text.
 */
import { Calendar, Clock } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { toDayKey } from '../../health/dates';
import { radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../ui';

type Picker = typeof import('@react-native-community/datetimepicker').DateTimePickerAndroid;

function androidPicker(): Picker | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker'))
      .DateTimePickerAndroid;
  } catch {
    return null;
  }
}

export function formatDateLong(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
export function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function DateTimeField({
  label,
  value,
  onChange,
  mode,
  maximumDate,
  minimumDate,
  error,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  mode: 'date' | 'time';
  maximumDate?: Date;
  minimumDate?: Date;
  error?: boolean;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const Icon = mode === 'date' ? Calendar : Clock;
  const text = mode === 'date' ? formatDateLong(value) : formatTime(value);

  const open = () => {
    const p = androidPicker();
    if (!p) return;
    p.open({
      value,
      mode,
      maximumDate,
      minimumDate,
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(date);
      },
    });
  };

  return (
    <Pressable
      onPress={open}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${text}`}
      accessibilityHint={`Opens a ${mode} picker`}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: 52,
        minWidth: touch.min,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.md,
        borderRadius: radius.chip,
        borderWidth: focused || error ? 2 : 1.5,
        borderColor: error ? c.danger : focused ? c.focus : c.line,
        backgroundColor: c.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon size={18} color={c.muted} />
      <View style={{ flex: 1 }}>
        <Text>{text}</Text>
      </View>
    </Pressable>
  );
}

/** Combine the calendar date of `day` with the clock time of `time`. */
export function withTime(day: Date, time: Date): Date {
  const d = new Date(day);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}

/**
 * Bedtime/wake → instants. If both dates are the same calendar day but the wake clock time is
 * not after the bedtime (e.g. 23:30 → 07:00 with both dates left on today), the night crossed
 * midnight: bedtime is taken as the evening before. Otherwise the dates are used as picked and
 * validateSleep reports a wake time before bedtime inline.
 */
export function sleepRange(bedDay: Date, bedTime: Date, wakeDay: Date, wakeTime: Date): { start: Date; end: Date } {
  let start = withTime(bedDay, bedTime);
  const end = withTime(wakeDay, wakeTime);
  if (toDayKey(bedDay) === toDayKey(wakeDay) && end.getTime() <= start.getTime()) {
    const prev = new Date(bedDay);
    prev.setDate(prev.getDate() - 1);
    start = withTime(prev, bedTime);
  }
  return { start, end };
}
