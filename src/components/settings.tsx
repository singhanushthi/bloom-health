/**
 * Building blocks for the Settings hub, its sub-pages and the Connect wizards:
 * page header with a back button, grouped rows, status pills, numbered steps, toggle rows and
 * inline messages. Status is always icon + text (never colour alone); every target ≥ 44 dp.
 */
import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleDashed, Info, TriangleAlert } from 'lucide-react-native';
import React from 'react';
import { Pressable, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, shadow, space, touch } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { IconButton, Text } from './ui';

/** Back that always lands somewhere sensible (deep links / cold starts have no history). */
export function goBack(fallback: string): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function PageHeader({ title, subtitle, fallback }: { title: string; subtitle?: string; fallback: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => goBack(fallback)} />
      <Text variant="displaySm" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
    </View>
  );
}

/** A titled group of rows inside one rounded surface. */
export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const { c } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: space.xs }}>
      {title ? (
        <Text variant="label" tone="muted" accessibilityRole="header" style={{ textTransform: 'uppercase', marginLeft: space.xxs }}>
          {title}
        </Text>
      ) : null}
      <View
        style={[
          { backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.line, overflow: 'hidden' },
          shadow(c),
        ]}
      >
        {items.map((child, i) => (
          <View key={i} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

export function IconBadge({ icon: Icon, accent, soft, size = 40 }: { icon: LucideIcon; accent: string; soft: string; size?: number }) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: 12, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon size={Math.round(size * 0.52)} color={accent} strokeWidth={2.2} />
    </View>
  );
}

/** A tappable row: icon, title, one-line description, optional status text, chevron. */
export function SettingsRow({
  icon,
  title,
  body,
  onPress,
  accent,
  soft,
  status,
  accessibilityHint,
  left,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  onPress: () => void;
  accent?: string;
  soft?: string;
  /** Short status shown on the right ("On", "Off", "Connected"). */
  status?: string;
  accessibilityHint?: string;
  /** Custom left element instead of an icon (e.g. a monogram). */
  left?: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, status, body].filter(Boolean).join('. ')}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: touch.min + 28,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        backgroundColor: pressed ? c.surfaceAlt : 'transparent',
      })}
    >
      {left ?? (icon ? <IconBadge icon={icon} accent={accent ?? c.ink} soft={soft ?? c.surfaceAlt} /> : null)}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {body ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {body}
          </Text>
        ) : null}
      </View>
      {status ? (
        <Text variant="caption" tone="muted">
          {status}
        </Text>
      ) : null}
      <ChevronRight size={20} color={c.muted} />
    </Pressable>
  );
}

export type PillTone = 'done' | 'todo' | 'warn';

/** Small status chip: icon + text. */
export function StatusPill({ tone, label, style }: { tone: PillTone; label: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const Icon = tone === 'done' ? CircleCheck : tone === 'warn' ? CircleAlert : CircleDashed;
  const bg = tone === 'done' ? c.spo2Soft : tone === 'warn' ? c.stepsSoft : c.surfaceAlt;
  const fg = tone === 'done' ? c.spo2 : tone === 'warn' ? c.steps : c.muted;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          paddingHorizontal: space.sm,
          paddingVertical: 6,
          borderRadius: radius.chip,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Icon size={16} color={fg} />
      <Text variant="caption">{label}</Text>
    </View>
  );
}

/** A switch with a visible label and a one-line explanation. */
export function ToggleRow({
  title,
  body,
  value,
  onChange,
  disabled,
  accent,
}: {
  title: string;
  body?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  accent?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingHorizontal: space.md, paddingVertical: space.sm }}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {body ? (
          <Text variant="caption" tone="muted">
            {body}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={title}
        accessibilityHint={body}
        trackColor={{ false: c.line, true: accent ?? c.spo2 }}
        thumbColor={c.surface}
        style={{ minWidth: 48, minHeight: 48 }}
      />
    </View>
  );
}

export type MessageTone = 'success' | 'error' | 'warn' | 'info';

/** Inline result / error message with an optional next step. Announced politely. */
export function InlineMessage({
  tone,
  title,
  body,
  children,
  testID,
}: {
  tone: MessageTone;
  title: string;
  body?: string;
  children?: React.ReactNode;
  testID?: string;
}) {
  const { c } = useTheme();
  const Icon = tone === 'success' ? CircleCheck : tone === 'error' ? CircleAlert : tone === 'warn' ? TriangleAlert : Info;
  const bg = tone === 'success' ? c.spo2Soft : tone === 'error' ? c.heartSoft : tone === 'warn' ? c.stepsSoft : c.surfaceAlt;
  const fg = tone === 'success' ? c.spo2 : tone === 'error' ? c.danger : tone === 'warn' ? c.steps : c.ink;
  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.chip + 2, backgroundColor: bg }}
    >
      <Icon size={22} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong">{title}</Text>
        {body ? <Text>{body}</Text> : null}
        {children}
      </View>
    </View>
  );
}

/** One numbered step in a guided flow. `done` swaps the number for a check mark. */
export function NumberedStep({
  n,
  title,
  body,
  done,
  children,
}: {
  n: number;
  title: string;
  body?: string;
  done?: boolean;
  children?: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: space.sm,
          padding: space.md,
          borderRadius: radius.card,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: done ? c.spo2 : c.line,
        },
        shadow(c),
      ]}
    >
      <View
        accessible
        accessibilityLabel={done ? `Step ${n}, done` : `Step ${n}`}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: done ? c.spo2Soft : c.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done ? <CircleCheck size={20} color={c.spo2} /> : <Text variant="bodyStrong">{n}</Text>}
      </View>
      <View style={{ flex: 1, gap: space.xs }}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text tone="muted">{body}</Text> : null}
        {children}
      </View>
    </View>
  );
}
