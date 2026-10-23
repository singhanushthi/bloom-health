/**
 * Bloom UI primitives. All text uses ink/muted for contrast; accents are for graphics.
 */
import type { LucideIcon } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { radius, shadow, space, touch, type, type TypeVariant } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/* ---------------------------------- Text --------------------------------- */

export function Text({
  variant = 'body',
  tone = 'ink',
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; tone?: 'ink' | 'muted' | 'danger' | 'onInk' }) {
  const { c } = useTheme();
  const color = tone === 'muted' ? c.muted : tone === 'danger' ? c.danger : tone === 'onInk' ? c.onInk : c.ink;
  return <RNText {...rest} style={[type[variant], { color }, style]} />;
}

/* ---------------------------------- Card --------------------------------- */

export function Card({
  children,
  style,
  accessibilityLabel,
  tint,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Summary read by screen readers instead of the card's individual pieces. */
  accessibilityLabel?: string;
  /** Optional soft background tint (one of the *Soft tokens). */
  tint?: string;
}) {
  const { c } = useTheme();
  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          backgroundColor: tint ?? c.surface,
          borderRadius: radius.card,
          padding: space.md + 4,
          borderWidth: 1,
          borderColor: tint ? 'transparent' : c.line,
        },
        shadow(c),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Card header: icon badge + label (+ optional right slot). */
export function CardHeader({
  icon: Icon,
  label,
  accent,
  soft,
  right,
}: {
  icon: LucideIcon;
  label: string;
  accent: string;
  soft: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
      <View
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: soft,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: space.xs,
        }}
      >
        <Icon size={18} color={accent} strokeWidth={2.2} />
      </View>
      <Text variant="label" tone="muted" style={{ flex: 1, textTransform: 'uppercase' }}>
        {label}
      </Text>
      {right}
    </View>
  );
}

/* -------------------------------- Buttons -------------------------------- */

type BtnVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon: Icon,
  loading,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  style,
}: {
  label: string;
  onPress: PressableProps['onPress'];
  variant?: BtnVariant;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const bg = variant === 'primary' ? c.ink : variant === 'secondary' ? c.surface : 'transparent';
  const fg = variant === 'primary' ? c.onInk : c.ink;
  const border = variant === 'secondary' ? c.line : 'transparent';
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      android_ripple={{ color: variant === 'primary' ? '#ffffff33' : c.line }}
      style={({ pressed }) => [
        {
          minHeight: 52,
          minWidth: touch.min,
          paddingHorizontal: space.lg,
          borderRadius: radius.pill,
          backgroundColor: bg,
          borderWidth: focused ? 3 : 1,
          borderColor: focused ? c.focus : border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <Icon size={20} color={fg} style={{ marginRight: space.xs }} /> : null}
          <Text variant="bodyStrong" style={{ color: fg }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Square-ish 44×44+ icon button. */
export function IconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  disabled,
}: {
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      android_ripple={{ color: c.line, borderless: true }}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: radius.chip,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.surfaceAlt,
        borderWidth: focused ? 3 : 0,
        borderColor: c.focus,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      })}
    >
      <Icon size={22} color={c.ink} />
    </Pressable>
  );
}

/* ------------------------------ Segmented ------------------------------- */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        backgroundColor: c.surfaceAlt,
        borderRadius: radius.chip + 4,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: touch.min,
              borderRadius: radius.chip,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? c.surface : 'transparent',
              borderWidth: selected ? 1 : 0,
              borderColor: c.line,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant={selected ? 'bodyStrong' : 'body'} tone={selected ? 'ink' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------------------------- Chip --------------------------------- */

export function Chip({
  label,
  icon: Icon,
  bg,
  iconColor,
}: {
  label: string;
  icon?: LucideIcon;
  bg?: string;
  iconColor?: string;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: bg ?? c.surfaceAlt,
        borderRadius: radius.chip,
        paddingHorizontal: space.sm,
        paddingVertical: 6,
        gap: 6,
      }}
    >
      {Icon ? <Icon size={14} color={iconColor ?? c.ink} /> : null}
      <Text variant="caption">{label}</Text>
    </View>
  );
}

/* ------------------------------- Skeleton ------------------------------- */

export function Skeleton({
  height,
  width = '100%',
  style,
}: {
  height: number;
  width?: ViewStyle['width'];
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.6, duration: 300, useNativeDriver: true }),
        Animated.delay(400),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return (
    <Animated.View
      importantForAccessibility="no"
      style={[
        { height, width, borderRadius: 12, backgroundColor: c.surfaceAlt, opacity: pulse },
        style,
      ]}
    />
  );
}

/** Skeleton occupying the same footprint as a metric card. */
export function CardSkeleton({ height = 160, label }: { height?: number; label: string }) {
  return (
    <Card accessibilityLabel={`Loading ${label}`}>
      <Skeleton height={20} width={120} />
      <Skeleton height={height - 60} style={{ marginTop: space.md }} />
    </Card>
  );
}

/* ------------------------------ Empty state ----------------------------- */

export function EmptyNote({
  icon: Icon,
  title,
  body,
  accent,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  accent: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      <Icon size={20} color={accent} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text tone="muted" style={{ marginTop: 2 }}>
          {body}
        </Text>
      </View>
    </View>
  );
}

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text variant="title" accessibilityRole="header" style={[{ marginBottom: space.sm }, style]}>
      {children}
    </Text>
  );
}
