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
          padding: space.md + space.xxs,
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
            <Text
              variant={selected ? 'bodyStrong' : 'body'}
              tone={selected ? 'ink' : 'muted'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{ paddingHorizontal: space.xxs }}
            >
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

/* ---------------------------- Section header ---------------------------- */

/**
 * Small-caps section label (13 px, muted) with an optional right-hand action.
 * Used to divide long screens into calm, scannable sections.
 */
export function SectionHeader({
  label,
  action,
  style,
}: {
  label: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', minHeight: 32, marginTop: space.xs }, style]}>
      <Text
        variant="label"
        tone="muted"
        accessibilityRole="header"
        style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 1 }}
      >
        {label}
      </Text>
      {action}
    </View>
  );
}

/* ------------------------------ Text button ----------------------------- */

/** Low-emphasis text action ("Log weight", "See all"). ≥44 px tall, no border. */
export function TextButton({
  label,
  onPress,
  icon: Icon,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: PressableProps['accessibilityState'];
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      hitSlop={4}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => [
        {
          minHeight: touch.min,
          minWidth: touch.min,
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 6,
          paddingHorizontal: space.xs,
          marginHorizontal: -space.xs,
          borderRadius: radius.chip,
          borderWidth: focused ? 2 : 0,
          borderColor: c.focus,
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      {Icon ? <Icon size={18} color={c.ink} /> : null}
      <Text variant="bodyStrong" style={{ textDecorationLine: 'underline', textDecorationColor: c.line }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------- Stat tile ------------------------------ */

/** Small tappable stat: icon + label on top, big serif number, short muted sub-line. */
export function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  accent,
  soft,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent: string;
  soft: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => [
        {
          backgroundColor: c.surface,
          borderRadius: radius.card - 4,
          padding: space.md,
          minHeight: 112,
          overflow: 'hidden',
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        shadow(c),
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View
          style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon size={14} color={accent} strokeWidth={2.4} />
        </View>
        <Text variant="label" tone="muted" numberOfLines={1} style={{ flex: 1, textTransform: 'uppercase' }}>
          {label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: space.xs }}>
        <Text variant="displaySm" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1 }}>
          {value}
        </Text>
        {unit ? (
          <Text variant="caption" tone="muted">
            {unit}
          </Text>
        ) : null}
      </View>
      {sub ? (
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

/* ----------------------------- Quick action ----------------------------- */

/** Round icon button with a label underneath (Quick log row). */
export function QuickAction({
  icon: Icon,
  label,
  accent,
  soft,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  icon: LucideIcon;
  label: string;
  accent: string;
  soft: string;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: touch.min,
        alignItems: 'center',
        gap: 6,
        paddingVertical: space.xxs,
        opacity: pressed ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: soft,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: focused ? 3 : 0,
          borderColor: c.focus,
        }}
      >
        <Icon size={22} color={accent} strokeWidth={2.2} />
      </View>
      <Text variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}
