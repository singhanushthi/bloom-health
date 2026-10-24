/** Friendly "Set up AI Coach in 1 minute" card shown wherever an AI feature needs a key. */
import { router } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { space } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Button, Card, Text } from './ui';

export const AI_SETUP_ROUTE = '/settings/ai';

export function SetUpAiCard({
  body = 'Turn on the AI coach with your own free Google key. Bloom shows you each step.',
  primary = true,
}: {
  body?: string;
  /** false when the screen already has its own primary button. */
  primary?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Card tint={c.sleepSoft}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <KeyRound size={22} color={c.sleep} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodyStrong">Set up AI Coach in 1 minute</Text>
          <Text>{body}</Text>
        </View>
      </View>
      <Button
        label="Set up AI Coach"
        icon={KeyRound}
        variant={primary ? 'primary' : 'secondary'}
        onPress={() => router.push(AI_SETUP_ROUTE)}
        accessibilityHint="Opens AI Coach setup"
        style={{ marginTop: space.md }}
      />
    </Card>
  );
}
