/**
 * Settings hub (opened from the gear on Today): a short list of sections, each its own page.
 *
 * Where every setting from the old one-page Settings now lives:
 *  - What you track, Edit goal & profile, Show onboarding again → /settings/profile
 *  - Your cycle, Cycle reminders, discreet mode, Hide cycle data on Today → /settings/cycle
 *  - Health Connect sharing toggles (read weight, save weights/meals/workouts),
 *    past-data note, "which app sent what" sources list → /settings/health-connect
 *  - Health Connect install / connect / manage permissions → /connect (status hero)
 *  - Connect apps, Watch (direct, beta), Connected-apps checklist (Flo, NoiseFit, Google Fit)
 *    → /connect and its wizards (/connect/[appId]; direct watch → /watch)
 *  - Steps: daily goal, stride, physical-activity permission, all-day note → /settings/steps
 *  - AI Coach key → /settings/ai
 *  - Export, Delete all, Demo mode, privacy text → /settings/data
 *  - Version, what's new, safety → /settings/about
 */
import { router } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { useCoach } from '../../ai/CoachState';
import { Screen } from '../../components/Screen';
import { PageHeader, SettingsGroup, SettingsRow } from '../../components/settings';
import { Text } from '../../components/ui';
import { SETTINGS_GROUPS, type SectionId } from '../../settings/sections';
import { useAppState } from '../../state/AppState';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function SettingsHub() {
  const { c } = useTheme();
  const app = useAppState();
  const coach = useCoach();

  const status = (id: SectionId): string | undefined => {
    if (id === 'ai') return coach.ready ? (coach.hasKey ? 'On' : 'Off') : undefined;
    if (id === 'connect') return app.availability === 'available' && app.granted.size > 0 ? 'Connected' : undefined;
    if (id === 'data' && app.demoMode) return 'Demo on';
    return undefined;
  };

  return (
    <Screen>
      <PageHeader title="Settings" subtitle="Pick a section. Each one opens its own page." fallback="/(tabs)" />
      {SETTINGS_GROUPS.map((g) => (
        <SettingsGroup key={g.title} title={g.title}>
          {g.sections.map((s) => (
            <SettingsRow
              key={s.id}
              icon={s.icon}
              accent={c[s.accent]}
              soft={c[s.soft]}
              title={s.title}
              body={s.body}
              status={status(s.id)}
              onPress={() => router.push(s.route)}
              accessibilityHint={`Opens ${s.title}`}
            />
          ))}
        </SettingsGroup>
      ))}
      <View accessible style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center', paddingHorizontal: space.xxs }}>
        <ShieldCheck size={18} color={c.spo2} />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          Your data stays on this phone. No account, no server.
        </Text>
      </View>
    </Screen>
  );
}
