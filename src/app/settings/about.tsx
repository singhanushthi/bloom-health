/** Settings → About Bloom: version, what's new in 1.2, and safety notes. */
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
  'The Settings gear works again. Settings is now a short list, and each section opens its own page.',
  'AI Coach setup in three steps, with a Paste button and a clear message if something goes wrong.',
  'Connect apps: one Health Connect button, and a step-by-step guide for each app (Noise, Flo, Google Fit and more).',
  'A calmer Today: four glance tiles, a quick-log row, and Customise Today to hide what you don’t need.',
  'Plan is split into Overview, Food, Activity and Weight.',
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
        <CardHeader icon={Sparkles} label="What’s new in 1.2" accent={c.sleep} soft={c.sleepSoft} />
        <Bullets items={WHATS_NEW} />
      </Card>
      <Card>
        <CardHeader icon={HeartHandshake} label="Safety" accent={c.heart} soft={c.heartSoft} />
        <Bullets items={SAFETY} />
      </Card>
    </Screen>
  );
}
