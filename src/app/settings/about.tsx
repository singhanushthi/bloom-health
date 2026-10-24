/** Settings → About Bloom: version, what's new in 1.1, and safety notes. */
import Constants from 'expo-constants';
import { Flower2, HeartHandshake, Sparkles } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import appJson from '../../../app.json';
import { Screen } from '../../components/Screen';
import { PageHeader } from '../../components/settings';
import { Card, CardHeader, Text } from '../../components/ui';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

function appVersion(): string {
  return Constants.expoConfig?.version ?? appJson.expo.version;
}

const WHATS_NEW: string[] = [
  'A gentle plan for weight, food and activity, with safe limits.',
  'Guided yoga for every level, including period-friendly sessions.',
  'Kitchen: your pantry, barcode checks and recipes from what you have.',
  'Cycle 2.0: a fuller day log, calendar, insights and optional reminders.',
  'Direct Bluetooth heart rate from some watches (beta).',
  'Simpler Settings, step-by-step app connections and an easier AI Coach setup.',
];

const SAFETY: string[] = [
  'Bloom is not a medical device and doesn’t diagnose anything.',
  'Cycle predictions are estimates. Bloom is not a method of contraception.',
  'Plans are general guidance for adults. If you’re pregnant, breastfeeding, under 18 or managing a health condition, plan with your doctor.',
  'The AI Coach can be wrong. Check anything important with a doctor.',
  'If something feels wrong with your body, please talk to a doctor.',
];

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: space.xs }}>
      {items.map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: space.xs }}>
          <Text importantForAccessibility="no">•</Text>
          <Text style={{ flex: 1 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export default function AboutBloom() {
  const { c } = useTheme();
  const version = appVersion();
  return (
    <Screen>
      <PageHeader title="About Bloom" fallback="/settings" />
      <Card tint={c.cycleSoft}>
        <View accessible accessibilityLabel={`Bloom, version ${version}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Flower2 size={32} color={c.cycle} />
          <View style={{ flex: 1 }}>
            <Text variant="title">Bloom</Text>
            <Text>Version {version}</Text>
          </View>
        </View>
        <Text style={{ marginTop: space.sm }}>Your cycle, steps, sleep and heart in one calm place. Everything stays on this phone.</Text>
      </Card>
      <Card>
        <CardHeader icon={Sparkles} label="What’s new in 1.1" accent={c.sleep} soft={c.sleepSoft} />
        <Bullets items={WHATS_NEW} />
      </Card>
      <Card>
        <CardHeader icon={HeartHandshake} label="Safety" accent={c.heart} soft={c.heartSoft} />
        <Bullets items={SAFETY} />
      </Card>
    </Screen>
  );
}
