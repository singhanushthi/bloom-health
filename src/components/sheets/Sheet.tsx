/**
 * Bottom sheet (RN Modal) + form primitives shared by all logging sheets.
 * Rules: visible labels (never placeholder-only), inline errors under the field,
 * ≥44px targets, chips encode selection with a check icon + border (not colour only).
 */
import { Check, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { fonts, radius, space, touch } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { IconButton, Text } from '../ui';

export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable
          style={{ flex: 1, backgroundColor: '#00000066' }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          importantForAccessibility="no"
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: c.bg,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            maxHeight: '90%',
            paddingBottom: insets.bottom + space.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: space.md,
              paddingTop: space.md,
              paddingBottom: space.xs,
            }}
          >
            <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Text>
            <IconButton icon={X} onPress={onClose} accessibilityLabel={`Close ${title}`} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: space.md, gap: space.md, paddingBottom: space.md }}
          >
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: space.md, gap: space.xs }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  nativeID,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
  nativeID?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="bodyStrong" nativeID={nativeID}>
        {label}
      </Text>
      {children}
      {error ? (
        <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text tone="muted" variant="caption">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Input({ error, style, ...rest }: TextInputProps & { error?: boolean }) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      style={[
        {
          minHeight: 52,
          borderWidth: focused || error ? 2 : 1.5,
          borderColor: error ? c.danger : focused ? c.focus : c.line,
          borderRadius: radius.chip,
          paddingHorizontal: space.md,
          fontFamily: fonts.body,
          fontSize: 16,
          color: c.ink,
          backgroundColor: c.surface,
        },
        style,
      ]}
    />
  );
}

/** Selectable chip. Selection shown by check icon + filled background + border. */
export function ToggleChip({
  label,
  selected,
  onPress,
  accent,
  soft,
  role = 'checkbox',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accent?: string;
  soft?: string;
  role?: 'checkbox' | 'radio';
}) {
  const { c } = useTheme();
  const a = accent ?? c.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        minHeight: touch.min,
        paddingHorizontal: space.sm + 2,
        borderRadius: radius.chip,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? a : c.line,
        backgroundColor: selected ? (soft ?? c.surfaceAlt) : c.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {selected ? <Check size={16} color={a} strokeWidth={2.6} /> : null}
      <Text variant={selected ? 'bodyStrong' : 'body'}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
      {children}
    </View>
  );
}
