/**
 * Small UI parts shared by the plan screens. Same visual language as src/components/ui:
 * ink/muted text only, accents for graphics, ≥44 px targets, labels on every control,
 * meaning never by colour alone (numbers + icons + patterns carry it).
 */
import { router } from 'expo-router';
import { ChevronLeft, GlassWater, Info, Minus, Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { IconButton, Text } from '../../components/ui';
import { fonts, radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/** Screen header with a back button (predictable back behaviour). */
export function BackHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <IconButton
        icon={ChevronLeft}
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/plan'))}
      />
      <View style={{ flex: 1 }}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Soft info note with an icon (used for kind explanations). */
export function InfoNote({ children, tint, icon: Icon = Info, accent }: { children: React.ReactNode; tint?: string; icon?: LucideIcon; accent?: string }) {
  const { c } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="text"
      style={{
        flexDirection: 'row',
        gap: space.xs,
        alignItems: 'flex-start',
        backgroundColor: tint ?? c.surfaceAlt,
        borderRadius: radius.chip,
        padding: space.sm,
      }}
    >
      <Icon size={18} color={accent ?? c.muted} style={{ marginTop: 3 }} />
      <Text style={{ flex: 1 }}>{children}</Text>
    </View>
  );
}

/**
 * Number stepper: − [input] +. Keyboard entry allowed; value is committed on blur/submit.
 * `label` is used for the accessible names of all three controls.
 */
export function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  decimals = 1,
  unit,
  error,
  nativeID,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  decimals?: number;
  unit?: string;
  error?: boolean;
  nativeID?: string;
}) {
  const { c } = useTheme();
  const fmt = (v: number) => (decimals ? v.toFixed(decimals) : String(Math.round(v)));
  const [draft, setDraft] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const commit = (t: string) => {
    const n = Number(t.replace(',', '.'));
    if (Number.isFinite(n) && t.trim() !== '') onChange(Math.round(n * 10 ** decimals) / 10 ** decimals);
    else setDraft(fmt(value));
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <IconButton icon={Minus} onPress={() => onChange(clamp(value - step))} accessibilityLabel={`Decrease ${label}`} disabled={value <= min} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit(draft);
          }}
          onSubmitEditing={(e) => commit(e.nativeEvent.text)}
          keyboardType="decimal-pad"
          returnKeyType="done"
          maxLength={6}
          accessibilityLabel={label}
          accessibilityHint={`Between ${min} and ${max}${unit ? ` ${unit}` : ''}`}
          style={{
            flex: 1,
            minHeight: 56,
            borderWidth: focused || error ? 2 : 1.5,
            borderColor: error ? c.danger : focused ? c.focus : c.line,
            borderRadius: radius.chip,
            textAlign: 'center',
            fontFamily: fonts.display,
            fontSize: 34,
            color: c.ink,
            backgroundColor: c.surface,
            paddingRight: unit ? 36 : 0,
          }}
        />
        {unit ? (
          <Text tone="muted" style={{ position: 'absolute', right: space.sm }} importantForAccessibility="no">
            {unit}
          </Text>
        ) : null}
      </View>
      <IconButton icon={Plus} onPress={() => onChange(clamp(value + step))} accessibilityLabel={`Increase ${label}`} disabled={value >= max} />
    </View>
  );
}

/** Labelled bar with numbers: "Protein 42 / 70 g". Over target shows a dashed end marker. */
export function MacroBar({ label, value, target, unit, color, soft }: { label: string; value: number; target: number; unit: string; color: string; soft: string }) {
  const frac = target > 0 ? Math.min(1, value / target) : 0;
  const met = target > 0 && value >= target;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}: ${Math.round(value)} of ${Math.round(target)} ${unit}${met ? ', target reached' : ''}`}
      accessibilityValue={{ min: 0, max: Math.round(target), now: Math.min(Math.round(value), Math.round(target)) }}
      style={{ gap: 4 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="bodyStrong">{label}</Text>
        <Text tone="muted">
          {Math.round(value)} / {Math.round(target)} {unit}
          {met ? ' ✓' : ''}
        </Text>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: soft, overflow: 'hidden' }}>
        <View style={{ width: `${frac * 100}%`, height: '100%', backgroundColor: color, borderRadius: 5 }} />
      </View>
    </View>
  );
}

/** Tap-to-add water glasses (250 ml each). Filled glasses also show a count in text. */
export function WaterGlasses({ ml, goalMl, onChange, glassMl = 250 }: { ml: number; goalMl: number; onChange: (ml: number) => void; glassMl?: number }) {
  const { c } = useTheme();
  const goal = Math.max(1, Math.round(goalMl / glassMl));
  const have = Math.round(ml / glassMl);
  const slots = Math.max(goal, have + 1);
  return (
    <View style={{ gap: space.xs }}>
      <Text accessibilityLiveRegion="polite">
        <Text variant="bodyStrong">{have}</Text> of {goal} glasses · {(ml / 1000).toFixed(2)} L
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {Array.from({ length: slots }, (_, i) => {
          const filled = i < have;
          return (
            <Pressable
              key={i}
              onPress={() => onChange(filled && i === have - 1 ? (have - 1) * glassMl : (i + 1) * glassMl)}
              accessibilityRole="button"
              accessibilityLabel={filled && i === have - 1 ? `Remove glass ${i + 1}` : `Set water to ${i + 1} glasses`}
              accessibilityState={{ checked: filled }}
              style={({ pressed }) => ({
                width: touch.min,
                height: touch.min + 4,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: filled ? 2 : 1,
                borderStyle: filled ? 'solid' : 'dashed',
                borderColor: filled ? c.sleep : c.line,
                backgroundColor: filled ? c.sleepSoft : c.surface,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <GlassWater size={20} color={filled ? c.sleep : c.muted} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        <SmallButton label="+ 1 glass (250 ml)" onPress={() => onChange(ml + glassMl)} />
        {ml > 0 ? <SmallButton label="− 1 glass" onPress={() => onChange(Math.max(0, ml - glassMl))} /> : null}
      </View>
    </View>
  );
}

export function SmallButton({ label, onPress, icon: Icon, accessibilityLabel }: { label: string; onPress: () => void; icon?: LucideIcon; accessibilityLabel?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: touch.min,
        paddingHorizontal: space.sm + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {Icon ? <Icon size={16} color={c.ink} /> : null}
      <Text variant="bodyStrong">{label}</Text>
    </Pressable>
  );
}

/** List row with edit + delete buttons (each ≥44 px and separately labelled). */
export function EntryRow({
  title,
  detail,
  right,
  badge,
  onEdit,
  onDelete,
  first,
}: {
  title: string;
  detail?: string;
  right?: string;
  badge?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  first?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingVertical: space.xs,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.line,
      }}
    >
      <View accessible accessibilityLabel={[title, detail, right, badge].filter(Boolean).join(', ')} style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {detail || badge ? (
          <Text variant="caption" tone="muted">
            {[detail, badge].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      {right ? <Text variant="bodyStrong">{right}</Text> : null}
      {onEdit ? <IconButton icon={Pencil} onPress={onEdit} accessibilityLabel={`Edit ${title}`} /> : null}
      {onDelete ? <IconButton icon={Trash2} onPress={onDelete} accessibilityLabel={`Delete ${title}`} /> : null}
    </View>
  );
}

export const fmtKg = (kg: number) => `${kg.toFixed(1)} kg`;

export function formatShortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
