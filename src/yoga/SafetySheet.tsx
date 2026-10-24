import { HeartHandshake } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { Sheet } from '../components/sheets/Sheet';
import { Button, Text } from '../components/ui';
import { space } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export const SAFETY_TEXT =
  'Move gently, stop if anything hurts; check with a doctor if pregnant, recently injured or with high BP.';

/** First-time safety note, shown once before the first session. */
export function SafetySheet({ visible, onAccept, onClose }: { visible: boolean; onAccept: () => void; onClose: () => void }) {
  const { c } = useTheme();
  return (
    <Sheet
      visible={visible}
      title="Before you start"
      onClose={onClose}
      footer={<Button label="I understand" onPress={onAccept} accessibilityHint="Closes this note and continues" />}
    >
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        <HeartHandshake size={26} color={c.cycle} />
        <Text style={{ flex: 1 }}>{SAFETY_TEXT}</Text>
      </View>
      <Text tone="muted">
        Bloom’s sessions are general wellness guidance, not medical advice. Breathe slowly, keep a soft bend in your
        knees whenever you need it, and rest in any pose you like.
      </Text>
    </Sheet>
  );
}
