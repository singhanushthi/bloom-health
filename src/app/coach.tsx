/**
 * AI coach chat (reached from the "Ask Bloom" card on Today — not a tab).
 * Uses the user's own Gemini key. Context = cached 30-day summary (rebuilt only when data
 * changes). Demo mode uses the mock data summary.
 */
import { router } from 'expo-router';
import { ArrowLeft, CalendarRange, KeyRound, Send, ShieldAlert, Sparkles, Sun } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCoach } from '../ai/CoachState';
import { GeminiError, type ChatTurn } from '../ai/gemini';
import { MORNING_BRIEF_PROMPT, PRIVACY_NOTE, SUGGESTED_PROMPTS, systemWithSummary, WEEKLY_REVIEW_PROMPT } from '../ai/prompts';
import { getSummary } from '../ai/summary';
import { Input } from '../components/sheets/Sheet';
import { Button, Card, IconButton, Text } from '../components/ui';
import { useAppState } from '../state/AppState';
import { radius, space, touch } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

interface Msg extends ChatTurn {
  id: number;
  /** Shown as a short label instead of the long canned prompt. */
  display?: string;
  error?: boolean;
}

const MAX_HISTORY_TURNS = 12;

export default function CoachScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const app = useAppState();
  const coach = useCoach();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(
    async (text: string, display?: string) => {
      const q = text.trim();
      if (!q || busy) return;
      const user: Msg = { id: nextId.current++, role: 'user', text: q, display };
      const replyId = nextId.current++;
      const history = msgs.filter((m) => !m.error);
      setMsgs((m) => [...m, user, { id: replyId, role: 'model', text: '' }]);
      setDraft('');
      setBusy(true);
      abort.current = new AbortController();
      try {
        const summary = await getSummary(app.ctx, app.dataVersion, app.stepGoal);
        const turns: ChatTurn[] = [...history, user].slice(-MAX_HISTORY_TURNS).map((m) => ({ role: m.role, text: m.text }));
        const r = await coach.ask({
          system: systemWithSummary(summary),
          turns,
          signal: abort.current.signal,
          onText: (full) => setMsgs((m) => m.map((x) => (x.id === replyId ? { ...x, text: full } : x))),
        });
        setMsgs((m) =>
          m.map((x) => (x.id === replyId ? { ...x, text: r.text || 'I couldn’t come up with an answer — try asking another way.' } : x))
        );
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
        const message =
          e instanceof GeminiError
            ? e.kind === 'auth'
              ? 'Google didn’t accept your key. Check it in Settings → AI Coach.'
              : e.message
            : e instanceof Error
              ? e.message
              : 'Something went wrong.';
        setMsgs((m) => m.map((x) => (x.id === replyId ? { ...x, text: message, error: true } : x)));
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, app.ctx, app.dataVersion, app.stepGoal, coach]
  );

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: false });
  }, [msgs]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: insets.top + space.sm, paddingBottom: space.sm }}>
      <IconButton icon={ArrowLeft} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityLabel="Back" />
      <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
        Ask Bloom
      </Text>
    </View>
  );

  if (!coach.ready) return <View style={{ flex: 1, backgroundColor: c.bg }}>{header}</View>;

  if (!coach.hasKey) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
          <Card tint={c.sleepSoft}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <KeyRound size={22} color={c.sleep} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="bodyStrong">Turn on the AI coach</Text>
                <Text>
                  Bloom’s coach uses your own free Google Gemini key. Get one at aistudio.google.com/app/apikey, then paste it
                  in Settings → AI Coach.
                </Text>
              </View>
            </View>
          </Card>
          <Button label="Open AI Coach settings" icon={KeyRound} onPress={() => router.push('/(tabs)/settings')} />
          <PrivacyNote />
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.md, gap: space.sm }} keyboardShouldPersistTaps="handled">
        {app.demoMode ? (
          <Text variant="caption" tone="muted">
            Demo mode: the coach sees sample data, not yours.
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          <Button
            label="Morning brief"
            icon={Sun}
            variant="secondary"
            onPress={() => send(MORNING_BRIEF_PROMPT, 'Morning brief')}
            disabled={busy}
            style={{ flex: 1, paddingHorizontal: space.sm }}
          />
          <Button
            label="Weekly review"
            icon={CalendarRange}
            variant="secondary"
            onPress={() => send(WEEKLY_REVIEW_PROMPT, 'Weekly review')}
            disabled={busy}
            style={{ flex: 1, paddingHorizontal: space.sm }}
          />
        </View>

        {msgs.length === 0 ? (
          <View style={{ gap: space.xs, marginTop: space.sm }}>
            <Text variant="label" tone="muted">
              TRY ASKING
            </Text>
            {SUGGESTED_PROMPTS.map((p) => (
              <Pressable
                key={p}
                onPress={() => send(p)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={p}
                android_ripple={{ color: c.line }}
                style={({ pressed }) => ({
                  minHeight: touch.min + 4,
                  justifyContent: 'center',
                  paddingHorizontal: space.md,
                  borderRadius: radius.chip,
                  borderWidth: 1,
                  borderColor: c.line,
                  backgroundColor: c.surface,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text>{p}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {msgs.map((m) => (
          <Bubble key={m.id} msg={m} pending={busy && m.role === 'model' && !m.text} />
        ))}
        <PrivacyNote />
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: space.xs,
          padding: space.sm,
          paddingBottom: insets.bottom + space.sm,
          borderTopWidth: 1,
          borderTopColor: c.line,
          backgroundColor: c.surface,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="caption" tone="muted" nativeID="askLabel">
            Your question
          </Text>
          <Input
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={600}
            accessibilityLabel="Your question"
            accessibilityLabelledBy="askLabel"
            style={{ maxHeight: 120, paddingTop: space.sm }}
            onSubmitEditing={() => send(draft)}
          />
        </View>
        <IconButton icon={Send} onPress={() => send(draft)} accessibilityLabel="Send question" disabled={busy || !draft.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg, pending }: { msg: Msg; pending: boolean }) {
  const { c } = useTheme();
  const mine = msg.role === 'user';
  const text = mine ? (msg.display ?? msg.text) : pending ? 'Thinking…' : msg.text;
  return (
    <View
      accessible
      accessibilityLabel={`${mine ? 'You' : msg.error ? 'Error' : 'Bloom'}: ${text}`}
      accessibilityLiveRegion={mine ? 'none' : 'polite'}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        padding: space.sm,
        borderRadius: radius.chip,
        backgroundColor: mine ? c.ink : msg.error ? c.heartSoft : c.surface,
        borderWidth: mine ? 0 : 1,
        borderColor: msg.error ? c.danger : c.line,
        flexDirection: 'row',
        gap: 6,
      }}
    >
      {!mine ? (
        msg.error ? <ShieldAlert size={16} color={c.danger} style={{ marginTop: 4 }} /> : <Sparkles size={16} color={c.sleep} style={{ marginTop: 4 }} />
      ) : null}
      <Text tone={mine ? 'onInk' : 'ink'} style={{ flexShrink: 1 }}>
        {text}
      </Text>
    </View>
  );
}

function PrivacyNote() {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.sm }}>
      <ShieldAlert size={16} color={c.muted} style={{ marginTop: 1 }} />
      <Text variant="caption" tone="muted" style={{ flex: 1 }}>
        {PRIVACY_NOTE} Not medical advice.
      </Text>
    </View>
  );
}
