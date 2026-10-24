/**
 * Self-contained "Today's yoga" card for the Today screen and the Yoga tab.
 */
import { router } from 'expo-router';
import { CircleCheck, Flower2, Play } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { Button, Card, CardHeader, Chip, Skeleton, Text } from '../components/ui';
import { space } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { LEVEL_LABEL, poseCount } from './logic';
import { PoseFigure } from './PoseFigure';
import { useToday } from './today';

export function TodayYogaCard({ hero = false }: { hero?: boolean } = {}): React.JSX.Element {
  const { c } = useTheme();
  const t = useToday();

  if (t.loading) {
    return (
      <Card accessibilityLabel="Loading today's yoga">
        <Skeleton height={20} width={140} />
        <Skeleton height={hero ? 140 : 72} style={{ marginTop: space.md }} />
      </Card>
    );
  }

  const done = t.doneToday[0];
  if (done) {
    return (
      <Card tint={c.spo2Soft}>
        <CardHeader icon={Flower2} label="Today's yoga" accent={c.spo2} soft={c.surface} />
        <View
          accessible
          accessibilityLabel={`Done for today: ${done.title}, ${Math.round(done.minutes)} minutes`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
        >
          <CircleCheck size={28} color={c.spo2} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Done for today</Text>
            <Text tone="muted">
              {done.title} · {Math.round(done.minutes)} min
            </Text>
          </View>
        </View>
        <Button
          variant="secondary"
          label="Browse sessions"
          onPress={() => router.push('/(tabs)/yoga')}
          style={{ marginTop: space.md }}
        />
      </Card>
    );
  }

  const s = t.session;
  if (!s) {
    return (
      <Card>
        <CardHeader icon={Flower2} label="Today's yoga" accent={c.cycle} soft={c.cycleSoft} />
        <Text tone="muted">No session to suggest right now.</Text>
        <Button
          variant="secondary"
          label="Browse sessions"
          onPress={() => router.push('/(tabs)/yoga')}
          style={{ marginTop: space.md }}
        />
      </Card>
    );
  }

  const firstPose = s.items[0]?.poseId;
  return (
    <Card>
      <CardHeader
        icon={Flower2}
        label={t.program ? `${t.program.title} · Day ${(t.programDay ?? 0) + 1}` : "Today's yoga"}
        accent={c.cycle}
        soft={c.cycleSoft}
      />
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant={hero ? 'displaySm' : 'title'} accessibilityRole="header">
            {s.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="displaySm">{s.minutes}</Text>
            <Text tone="muted">min · {poseCount(s)} poses</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            <Chip label={LEVEL_LABEL[s.level]} />
            {s.periodFriendly && t.onPeriod ? <Chip label="Period-friendly" icon={Flower2} iconColor={c.cycle} bg={c.cycleSoft} /> : null}
          </View>
        </View>
        {firstPose ? <PoseFigure poseId={firstPose} size={hero ? 112 : 84} /> : null}
      </View>
      {t.onPeriod ? (
        <Text tone="muted" style={{ marginTop: space.sm }}>
          {t.swappedForPeriod
            ? 'Your program can wait a day — here’s a gentler session for your period.'
            : 'Gentle picks for your period. Go easy and rest whenever you like.'}
        </Text>
      ) : null}
      <Button
        label="Start"
        icon={Play}
        accessibilityLabel={`Start ${s.title}, ${s.minutes} minutes`}
        onPress={() =>
          router.push({
            pathname: '/yoga/session/[id]',
            params: t.program && t.programDay !== null
              ? { id: s.id, program: t.program.id, day: String(t.programDay) }
              : { id: s.id },
          })
        }
        style={{ marginTop: space.md }}
      />
    </Card>
  );
}
