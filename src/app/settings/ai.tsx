/**
 * Settings → AI Coach: get a free Gemini key in three numbered steps.
 *  1. Open Google AI Studio.  2. Paste the key (Paste button reads the clipboard).  3. Save & test.
 * Every failure says what happened and one plain next step. The key is never logged or shown
 * again after saving (only its last 4 characters).
 */
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { ClipboardPaste, ExternalLink, Eye, EyeOff, KeyRound, ShieldCheck, Sparkles, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { modelLabel, useCoach, type SaveOutcome } from '../../ai/CoachState';
import { MODELS } from '../../ai/gemini';
import { cleanPastedKey, inspectKey } from '../../ai/key';
import { Screen } from '../../components/Screen';
import { InlineMessage, NumberedStep, PageHeader } from '../../components/settings';
import { Input } from '../../components/sheets/Sheet';
import { Button, Card, Skeleton, Text } from '../../components/ui';
import { radius, space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const AI_STUDIO_URL = 'https://aistudio.google.com/app/apikey';

export default function AiCoachSettings() {
  const coach = useCoach();
  const [replacing, setReplacing] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [justSaved, setJustSaved] = useState<SaveOutcome | null>(null);
  const showSteps = coach.ready && (!coach.hasKey || replacing);

  return (
    <Screen avoidKeyboard>
      <PageHeader title="AI Coach" subtitle="Ask Bloom about your sleep, steps and cycle. It’s free with your own Google key." fallback="/settings" />
      {!coach.ready ? (
        <Skeleton height={96} />
      ) : (
        <StatusCard
          justSaved={justSaved}
          removed={removed}
          replacing={replacing}
          onReplace={() => {
            setReplacing(true);
            setJustSaved(null);
          }}
          onRemove={async () => {
            await coach.removeKey();
            setReplacing(false);
            setJustSaved(null);
            setRemoved(true);
          }}
        />
      )}
      {showSteps ? (
        <KeySteps
          onSaved={(r) => {
            setRemoved(false);
            setReplacing(false);
            setJustSaved(r);
          }}
        />
      ) : null}
      <PrivacyCard />
    </Screen>
  );
}

function StatusCard({
  justSaved,
  removed,
  replacing,
  onReplace,
  onRemove,
}: {
  justSaved: SaveOutcome | null;
  removed: boolean;
  replacing: boolean;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const { c } = useTheme();
  const coach = useCoach();
  const model = modelLabel(coach.lastModel) ?? modelLabel(MODELS[0].id);
  const on = coach.hasKey;

  return (
    <Card tint={on ? c.spo2Soft : c.surfaceAlt}>
      <View accessible accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Sparkles size={26} color={on ? c.spo2 : c.muted} />
        <View style={{ flex: 1 }}>
          <Text variant="heading">{on ? `AI Coach is on ✓ (using ${model})` : 'AI Coach is off'}</Text>
          <Text tone="muted">
            {on ? `Key ending ${coach.masked ?? ''}` : removed ? 'Your key was removed from this phone.' : 'Follow the 3 steps below. It takes about a minute.'}
          </Text>
        </View>
      </View>
      {on && justSaved ? (
        <View style={{ marginTop: space.md }}>
          <InlineMessage tone={justSaved.kind === 'ok-quota' ? 'warn' : 'success'} title={justSaved.message} body={justSaved.next} testID="save-result" />
        </View>
      ) : null}
      {on && !replacing ? (
        <View style={{ gap: space.xs, marginTop: space.md }}>
          <Button label="Ask Bloom" icon={Sparkles} onPress={() => router.push('/coach')} accessibilityHint="Opens the AI coach chat" />
          <Button label="Use a different key" variant="secondary" icon={KeyRound} onPress={onReplace} />
          <Button label="Remove key" variant="ghost" icon={Trash2} onPress={onRemove} accessibilityHint="Deletes the key from this phone and turns AI Coach off" />
        </View>
      ) : null}
    </Card>
  );
}

function KeySteps({ onSaved }: { onSaved: (r: SaveOutcome) => void }) {
  const { c } = useTheme();
  const coach = useCoach();
  const [draft, setDraft] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveOutcome | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [openError, setOpenError] = useState(false);

  const check = inspectKey(draft);
  const canSave = !busy && (check.level === 'ok' || check.level === 'warn');

  const paste = async () => {
    setPasteNote(null);
    setResult(null);
    try {
      const text = cleanPastedKey(await Clipboard.getStringAsync());
      if (!text) {
        setPasteNote('Nothing to paste yet. In AI Studio, tap the copy icon next to your key, then come back and tap Paste.');
        return;
      }
      setDraft(text);
    } catch {
      setPasteNote('Couldn’t read the clipboard. Long-press the box below and choose Paste instead.');
    }
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await coach.saveAndTestKey(draft);
      if (r.ok) {
        setDraft('');
        onSaved(r);
      } else setResult(r);
    } catch {
      setResult({ ok: false, kind: 'error', message: 'Something went wrong while checking the key.', next: 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <NumberedStep n={1} title="Get your free key" body="Sign in with Google, tap Create API key, then copy it.">
        <Button
          label="Open Google AI Studio"
          variant="secondary"
          icon={ExternalLink}
          accessibilityHint="Opens Google AI Studio in your browser"
          onPress={() => {
            setOpenError(false);
            Linking.openURL(AI_STUDIO_URL).catch(() => setOpenError(true));
          }}
        />
        {openError ? (
          <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
            Couldn’t open the browser. Go to aistudio.google.com/app/apikey on any device.
          </Text>
        ) : null}
      </NumberedStep>

      <NumberedStep n={2} title="Paste your key">
        <Text variant="bodyStrong" nativeID="geminiKeyLabel">
          Gemini API key
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Input
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              setResult(null);
              setPasteNote(null);
            }}
            placeholder="AQ.… or AIza…"
            secureTextEntry={!visible}
            keyboardType={visible ? 'visible-password' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            error={check.level === 'error' || (!!result && !result.ok)}
            accessibilityLabel="Gemini API key"
            accessibilityLabelledBy="geminiKeyLabel"
            style={{ flex: 1 }}
          />
          <Pressable
            onPress={() => setVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide key' : 'Show key'}
            hitSlop={4}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              borderRadius: radius.chip,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.surfaceAlt,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            {visible ? <EyeOff size={22} color={c.ink} /> : <Eye size={22} color={c.ink} />}
          </Pressable>
        </View>
        {check.level === 'error' ? (
          <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
            {check.message}
          </Text>
        ) : check.level === 'warn' ? (
          <Text variant="caption" accessibilityLiveRegion="polite">
            {check.message}
          </Text>
        ) : (
          <Text variant="caption" tone="muted">
            New keys start with “AQ.”, older ones with “AIza”. Both work.
          </Text>
        )}
        <Button label="Paste" variant="secondary" icon={ClipboardPaste} onPress={paste} accessibilityHint="Pastes the key you copied" />
        {pasteNote ? (
          <Text variant="caption" accessibilityLiveRegion="polite">
            {pasteNote}
          </Text>
        ) : null}
      </NumberedStep>

      <NumberedStep n={3} title="Check that it works" body="Bloom saves the key and sends Google one tiny test message.">
        <Button
          label={busy ? 'Checking your key…' : 'Save & test'}
          icon={KeyRound}
          onPress={save}
          loading={busy}
          disabled={!canSave}
          accessibilityLabel="Save and test key"
          accessibilityHint={check.level === 'empty' ? 'Paste your key first' : undefined}
        />
        {result && !result.ok ? <InlineMessage tone="error" title={result.message} body={result.next} testID="save-result" /> : null}
      </NumberedStep>
    </View>
  );
}

function PrivacyCard() {
  const { c } = useTheme();
  return (
    <Card tint={c.surfaceAlt}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <ShieldCheck size={22} color={c.spo2} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant="bodyStrong">Private by design</Text>
          <Text>
            Your key is stored encrypted on this phone and only ever sent to Google. When you ask a question, your question and a short
            summary of your data go to Google. Day-log notes are never sent.
          </Text>
          <Text tone="muted">
            On the free tier Google may use what you send to improve its products. The free limit is small and resets around 12:30–1:30
            pm IST.
          </Text>
        </View>
      </View>
    </Card>
  );
}
