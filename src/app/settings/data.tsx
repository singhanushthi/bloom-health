/** Settings → Data & privacy: export, delete everything (confirmed), demo mode, privacy. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Download, ShieldCheck, Sparkles, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { clearSummaryCache } from '../../ai/summary';
import { Screen } from '../../components/Screen';
import { InlineMessage, PageHeader, SettingsGroup, ToggleRow } from '../../components/settings';
import { Button, Card, CardHeader, Text } from '../../components/ui';
import { deleteEverything } from '../../db/allData';
import { exportAndShare } from '../../db/share';
import { WIZARD_TICKS_KEY } from '../../health/connectWizard';
import { useAppState } from '../../state/AppState';
import { space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const DELETE_CONFIRM_TITLE = 'Delete all your data?';

export default function DataPrivacy() {
  const { c } = useTheme();
  const app = useAppState();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const onExport = async () => {
    setBusy('export');
    setNote(null);
    try {
      const r = await exportAndShare();
      if (r === 'unavailable') setNote({ ok: false, text: 'Sharing isn’t available on this phone.' });
    } catch {
      setNote({ ok: false, text: 'Couldn’t export. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const onDelete = () => {
    Alert.alert(
      DELETE_CONFIRM_TITLE,
      'This permanently deletes every period, day log, sleep log, reading, step count, weight, food, activity, your plan, yoga history, kitchen items, cycle settings and your paired watch saved in Bloom on this phone. Data in Health Connect, Flo or other apps is not touched. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            setNote(null);
            try {
              await deleteEverything();
              await AsyncStorage.multiRemove([WIZARD_TICKS_KEY, 'bloom.checklist.v1']).catch(() => {});
              clearSummaryCache();
              app.bump();
              setNote({ ok: true, text: 'All data saved in Bloom was deleted.' });
            } catch {
              setNote({ ok: false, text: 'Couldn’t delete. Please try again.' });
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <PageHeader title="Data & privacy" subtitle="Your data, your choice." fallback="/settings" />

      <Card tint={c.spo2Soft}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <ShieldCheck size={24} color={c.spo2} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="bodyStrong">Your data stays on this phone</Text>
            <Text>
              Everything you log is stored only on this phone. There’s no account, no server and no analytics. Health Connect is
              on this phone too, and Bloom saves to it only if you turn that on.
            </Text>
            <Text>
              The only thing that leaves the phone is what you send to the optional AI Coach: your question and a short summary of
              your data, sent to Google.
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <CardHeader icon={Download} label="Export" accent={c.sleep} soft={c.sleepSoft} />
        <Text tone="muted" style={{ marginBottom: space.md }}>
          Save a copy of everything as a JSON file. Keep it as a backup.
        </Text>
        <Button
          label="Export my data"
          icon={Download}
          onPress={onExport}
          loading={busy === 'export'}
          accessibilityHint="Opens the share sheet with a JSON file of everything you logged"
        />
      </Card>

      <SettingsGroup title="Try it out">
        <ToggleRow
          title="Demo mode"
          body="Show sample data on every screen. Your real data is kept safe."
          value={app.demoMode}
          accent={c.sleep}
          onChange={(v) => {
            clearSummaryCache();
            app.setDemoMode(v);
          }}
        />
      </SettingsGroup>
      {app.demoMode ? (
        <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center', marginHorizontal: space.xxs }}>
          <Sparkles size={16} color={c.sleep} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            Demo mode is on. Anything you log is still saved to your real data.
          </Text>
        </View>
      ) : null}

      <Card>
        <CardHeader icon={Trash2} label="Delete" accent={c.heart} soft={c.heartSoft} />
        <Text tone="muted" style={{ marginBottom: space.md }}>
          Remove everything Bloom saved on this phone. Bloom asks you to confirm first.
        </Text>
        <Button
          label="Delete all my data"
          variant="secondary"
          icon={Trash2}
          onPress={onDelete}
          loading={busy === 'delete'}
          accessibilityHint="Asks for confirmation first"
        />
      </Card>

      {note ? <InlineMessage tone={note.ok ? 'success' : 'error'} title={note.text} /> : null}
    </Screen>
  );
}
