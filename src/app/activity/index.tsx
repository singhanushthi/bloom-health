/**
 * Today's activity: what you logged (edit/delete) + Health Connect sessions (read-only, by source).
 * Logged exercise is "extra burn"; half of it is added to the day's food allowance.
 */
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React from 'react';
import { Alert, View } from 'react-native';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { Button, Card, CardHeader, CardSkeleton, Text } from '../../components/ui';
import { appName } from '../../health/sources';
import { removeActivity } from '../../plan/activity';
import { ACTIVITY_LABEL, INTENSITY_LABEL, type ActivityType } from '../../plan/met';
import { usePlan } from '../../plan/usePlan';
import { ACTIVITY_ICON } from '../../plan/ui/activityIcons';
import { BackHeader, EntryRow, InfoNote } from '../../plan/ui/parts';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const SOURCE_LABEL: Record<string, string> = { manual: 'Logged in Bloom', 'bloom-yoga': 'Bloom Yoga', 'health-connect': 'Health Connect' };

export default function ActivityToday() {
  const { c } = useTheme();
  const { state, loading } = usePlan();
  return (
    <Screen>
      <BackHeader title="Activity" subtitle="What you did today" />
      <DemoBanner />
      {loading && !state ? (
        <CardSkeleton label="activity" height={200} />
      ) : state ? (
        <>
          <Card>
            <View
              accessible
              accessibilityLabel={`Today: ${state.activityMinutes} active minutes, about ${Math.round(state.exerciseKcal)} kilocalories extra burn. ${Math.round(state.exerciseKcal / 2)} added to your food allowance.`}
              style={{ flexDirection: 'row', gap: space.xl }}
            >
              <View>
                <Text variant="display">{state.activityMinutes}</Text>
                <Text variant="caption" tone="muted">
                  active minutes
                </Text>
              </View>
              <View>
                <Text variant="display">{Math.round(state.exerciseKcal)}</Text>
                <Text variant="caption" tone="muted">
                  kcal extra burn
                </Text>
              </View>
            </View>
            <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
              +{Math.round(state.exerciseKcal / 2)} kcal added to today’s food allowance — we count half of exercise calories to stay
              on the safe side.
            </Text>
          </Card>
          <Button label="Log activity" icon={Plus} onPress={() => router.push('/activity/add')} />

          <Card>
            <CardHeader icon={ACTIVITY_ICON.walk} label="Logged today" accent={c.heart} soft={c.heartSoft} />
            {state.activities.length ? (
              state.activities.map((a, i) => {
                const t = (a.type in ACTIVITY_LABEL ? a.type : 'other') as ActivityType;
                const editable = a.id > 0;
                return (
                  <EntryRow
                    key={a.id}
                    first={i === 0}
                    title={a.title || ACTIVITY_LABEL[t]}
                    detail={`${a.minutes} min · ${INTENSITY_LABEL[a.intensity]} · ~${Math.round(a.kcal)} kcal`}
                    badge={state.demo ? 'Sample data' : SOURCE_LABEL[a.source] ?? a.source}
                    onEdit={editable ? () => router.push(`/activity/add?id=${a.id}`) : undefined}
                    onDelete={
                      editable
                        ? () =>
                            Alert.alert('Delete this activity?', a.title || ACTIVITY_LABEL[t], [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => void removeActivity(a.id) },
                            ])
                        : undefined
                    }
                  />
                );
              })
            ) : (
              <Text tone="muted">Nothing logged yet. A 10-minute walk counts!</Text>
            )}
          </Card>

          {state.hcSessions.length ? (
            <Card>
              <CardHeader icon={ACTIVITY_ICON.other} label="From other apps (read-only)" accent={c.spo2} soft={c.spo2Soft} />
              {state.hcSessions.map((h, i) => (
                <EntryRow key={`${h.start}-${i}`} first={i === 0} title={h.title} detail={`${h.minutes} min`} badge={`Source: ${appName(h.source)}`} />
              ))}
              <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
                Shown for your minutes only — their calories aren’t added to your allowance, so nothing is counted twice.
              </Text>
            </Card>
          ) : null}
          <InfoNote>Your daily plan already includes your usual activity level. Logged workouts are “extra burn”.</InfoNote>
        </>
      ) : null}
    </Screen>
  );
}
