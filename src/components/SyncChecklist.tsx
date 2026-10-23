/**
 * Optional checklist for apps that can feed Health Connect: Flo, NoiseFit → Google Fit.
 * Bloom works fully without any of them. Ticks are the user's own notes (persisted locally);
 * Bloom can't see other apps' settings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Square, SquareCheckBig } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { radius, space, touch } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Text } from './ui';

const KEY = 'bloom.checklist.v1';

export const SYNC_STEPS = [
  {
    id: 'flo',
    app: 'Flo',
    path: 'Flo → Settings → Health Connect',
    detail: 'Turn on sync and allow Flo to write menstruation data. Only if you use Flo.',
  },
  {
    id: 'noise',
    app: 'NoiseFit',
    path: 'NoiseFit → Profile → Connect Google Fit',
    detail: 'Links a Noise watch to Google Fit (Bloom never pairs with the watch itself). Only if you have one.',
  },
  {
    id: 'gfit',
    app: 'Google Fit',
    path: 'Google Fit → Profile → Settings → Sync Fit with Health Connect',
    detail: 'Sends steps, sleep, heart rate and SpO₂ to Health Connect.',
  },
] as const;

export function SyncChecklist() {
  const { c } = useTheme();
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setDone(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  return (
    <View style={{ gap: space.xs }}>
      {SYNC_STEPS.map((s) => {
        const checked = !!done[s.id];
        const Icon = checked ? SquareCheckBig : Square;
        return (
          <Pressable
            key={s.id}
            onPress={() => toggle(s.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={`${s.app}: ${s.path}. ${s.detail}`}
            accessibilityHint={checked ? 'Marks this step as not done' : 'Marks this step as done'}
            android_ripple={{ color: c.line }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: space.sm,
              padding: space.sm,
              minHeight: touch.min,
              borderRadius: radius.chip,
              backgroundColor: checked ? c.spo2Soft : c.surfaceAlt,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Icon size={24} color={checked ? c.spo2 : c.muted} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{s.path}</Text>
              <Text tone="muted">{s.detail}</Text>
              {checked ? (
                <Text variant="caption" style={{ marginTop: 2 }}>
                  Done
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
