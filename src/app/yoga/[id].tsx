/**
 * Session detail: overview, the pose list with timings, a cautions summary and Start.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clock, Flower2, Layers, Play } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Button, Card, Chip, IconButton, Text } from '../../components/ui';
import { POSES, SESSIONS } from '../../content/yoga';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { useOnPeriod, useYogaPrefs } from '../../yoga/hooks';
import { GOAL_LABEL, LEVEL_LABEL, buildPlaylist, poseCount, sessionCautions } from '../../yoga/logic';
import { PoseFigure } from '../../yoga/PoseFigure';
import { SafetySheet } from '../../yoga/SafetySheet';
import { CautionsCard, PeriodNote } from '../../yoga/SessionPlayer';

export default function YogaSessionDetail() {
  const { c } = useTheme();
  const p = useLocalSearchParams<{ id: string; program?: string; day?: string }>();
  const session = SESSIONS.find((s) => s.id === p.id) ?? null;
  const onPeriod = useOnPeriod();
  const { prefs, update } = useYogaPrefs();
  const [safety, setSafety] = useState(false);

  const playlist = useMemo(() => (session ? buildPlaylist(session, POSES, { onPeriod }) : null), [session, onPeriod]);
  const cautions = useMemo(() => (session ? sessionCautions(session, POSES) : []), [session]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/yoga'));

  if (!session || !playlist) {
    return (
      <Screen>
        <IconButton icon={ArrowLeft} accessibilityLabel="Back" onPress={back} />
        <Text variant="title">Session not found</Text>
      </Screen>
    );
  }

  const start = () => {
    if (!prefs.disclaimerSeen) return setSafety(true);
    router.push({
      pathname: '/yoga/session/[id]',
      params: { id: session.id, ready: '1', ...(p.program ? { program: p.program, day: p.day ?? '' } : {}) },
    });
  };

  // Group per-side steps back into one row per pose for the list.
  const rows: { poseId: string; seconds: number; perSide: boolean; modified: boolean; note?: string }[] = [];
  for (const s of playlist.steps) {
    const last = rows[rows.length - 1];
    if (s.side === 'right' && last && last.poseId === s.poseId && last.perSide) continue;
    rows.push({ poseId: s.poseId, seconds: s.seconds, perSide: !!s.side, modified: !!s.periodModified, note: s.note });
  }

  return (
    <Screen>
      <IconButton icon={ArrowLeft} accessibilityLabel="Back" onPress={back} />
      <Text variant="display" accessibilityRole="header">
        {session.title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        <Chip label={`${session.minutes} min`} icon={Clock} />
        <Chip label={`${poseCount(session)} poses`} icon={Layers} />
        <Chip label={LEVEL_LABEL[session.level]} />
        <Chip label={GOAL_LABEL[session.goal]} />
        {session.periodFriendly ? <Chip label="Period-friendly" icon={Flower2} iconColor={c.cycle} bg={c.cycleSoft} /> : null}
      </View>
      <Text>{session.description}</Text>

      {onPeriod ? <PeriodNote skipped={playlist.skippedForPeriod.map((x) => x.name)} /> : null}
      {cautions.length ? <CautionsCard cautions={cautions} /> : null}

      <Button label="Start" icon={Play} onPress={start} accessibilityLabel={`Start ${session.title}`} />

      <Text variant="title" accessibilityRole="header">
        Poses
      </Text>
      <Card>
        <View style={{ gap: space.sm }}>
          {rows.map((r, i) => {
            const pose = POSES.find((x) => x.id === r.poseId) ?? null;
            const time = `${r.seconds} s${r.perSide ? ' each side' : ''}`;
            return (
              <View
                key={`${r.poseId}-${i}`}
                accessible
                accessibilityLabel={`${i + 1}. ${pose?.name ?? r.poseId}, ${time}${r.modified ? ', easier version' : ''}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
              >
                <PoseFigure poseId={r.poseId} pose={pose} size={56} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{pose?.name ?? r.poseId}</Text>
                  {pose?.sanskrit ? (
                    <Text variant="caption" tone="muted">
                      {pose.sanskrit}
                    </Text>
                  ) : null}
                  {r.modified ? (
                    <Text variant="caption" tone="muted">
                      Easier version today
                    </Text>
                  ) : null}
                </View>
                <Text variant="caption" tone="muted">
                  {time}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      <SafetySheet
        visible={safety}
        onClose={() => setSafety(false)}
        onAccept={async () => {
          setSafety(false);
          await update({ disclaimerSeen: true });
          router.push({
            pathname: '/yoga/session/[id]',
            params: { id: session.id, ready: '1', ...(p.program ? { program: p.program, day: p.day ?? '' } : {}) },
          });
        }}
      />
    </Screen>
  );
}
