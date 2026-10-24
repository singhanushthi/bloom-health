/**
 * Small form/display parts shared by the cycle screens.
 */
import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight, Minus, Plus } from 'lucide-react-native';
import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import { DateTimeField } from '../components/sheets/DateTimeField';
import { IconButton, Text } from '../components/ui';
import { radius, space, touch } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { ClockTime } from './store';

export function SwitchRow({
  label,
  body,
  value,
  onChange,
  accessibilityHint,
  disabled,
}: {
  label: string;
  body?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  accessibilityHint?: string;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.xxs }}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {body ? <Text tone="muted">{body}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ checked: value, disabled: !!disabled }}
        trackColor={{ false: c.line, true: c.cycle }}
        thumbColor={c.surface}
        style={{ minWidth: 48, minHeight: 48 }}
      />
    </View>
  );
}

/** − value + stepper with a visible label (value read out by screen readers). */
export function Stepper({
  label,
  value,
  unit,
  min,
  max,
  onChange,
  error,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
  error?: string | null;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="bodyStrong">{label}</Text>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: `${value} ${unit}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + 1));
          if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - 1));
        }}
      >
        <IconButton icon={Minus} onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} accessibilityLabel={`Fewer ${unit} for ${label}`} />
        <View
          style={{
            minWidth: 96,
            minHeight: 52,
            borderRadius: radius.chip,
            borderWidth: error ? 2 : 1.5,
            borderColor: error ? c.danger : c.line,
            backgroundColor: c.surface,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
            paddingHorizontal: space.sm,
          }}
        >
          <Text variant="displaySm">{value}</Text>
          <Text tone="muted">{unit}</Text>
        </View>
        <IconButton icon={Plus} onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} accessibilityLabel={`More ${unit} for ${label}`} />
      </View>
      {error ? (
        <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function clockToDate(t: ClockTime): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}
export function dateToClock(d: Date): ClockTime {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function TimeRow({ label, value, onChange }: { label: string; value: ClockTime; onChange: (t: ClockTime) => void }) {
  return (
    <View style={{ gap: 6, marginBottom: space.xs }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <DateTimeField label={label} mode="time" value={clockToDate(value)} onChange={(d) => onChange(dateToClock(d))} />
    </View>
  );
}

/** Full-width tappable row that navigates somewhere. */
export function LinkRow({
  icon: Icon,
  label,
  hint,
  onPress,
  accent,
  soft,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onPress: () => void;
  accent: string;
  soft: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: Math.max(touch.min, 60),
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        padding: space.sm,
        borderRadius: radius.card,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={20} color={c.muted} />
    </Pressable>
  );
}

/** A small "Not a method of contraception" line, always shown with fertility info. */
export function ContraceptionNote({ style }: { style?: object }) {
  return (
    <Text variant="caption" tone="muted" style={style}>
      Estimates only. Not a method of contraception.
    </Text>
  );
}
