/**
 * Inline toast ("Added a glass of water · Undo"). Rendered in the flow of the screen, close to
 * the control that triggered it, so it never covers content or the tab bar. Announced politely
 * to screen readers and dismissed automatically after a few seconds.
 */
import { Check } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { radius, space } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Text, TextButton } from './ui';

export interface ToastMsg {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Toast({ msg, onDismiss, duration = 6000 }: { msg: ToastMsg | null; onDismiss: () => void; duration?: number }) {
  const { c } = useTheme();
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [msg, onDismiss, duration]);
  if (!msg) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        backgroundColor: c.ink,
        borderRadius: radius.chip,
        paddingLeft: space.sm,
        paddingRight: space.xs,
        minHeight: 48,
      }}
    >
      <Check size={18} color={c.onInk} />
      <Text tone="onInk" style={{ flex: 1 }}>
        {msg.text}
      </Text>
      {msg.actionLabel && msg.onAction ? (
        <InkTextButton
          label={msg.actionLabel}
          onPress={() => {
            msg.onAction?.();
            onDismiss();
          }}
        />
      ) : null}
    </View>
  );
}

/** TextButton tuned for the dark toast surface. */
function InkTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ borderRadius: radius.chip, backgroundColor: c.onInk, marginLeft: space.xxs }}>
      <TextButton label={label} onPress={onPress} style={{ marginHorizontal: 0, paddingHorizontal: space.sm }} />
    </View>
  );
}
