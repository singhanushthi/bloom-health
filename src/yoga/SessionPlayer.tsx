/**
 * Full-screen guided session: 5-second "Get ready / Next up", then each pose with a
 * countdown ring, side label, cues and an optional easier version. Pause, previous,
 * next and skip; optional haptics and voice; the screen stays awake.
 *
 * Completion (≥ 60 % of the playlist time) is saved to yoga history and logged as an
 * activity through the plan module.
 */
import { router } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  Flower2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { POSES, SESSIONS, type YogaLevel } from '../content/yoga';
import { Button, Card, Chip, IconButton, Text } from '../components/ui';
import { todayKey } from '../health/dates';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { addActivity } from '../plan/activity';
import { fonts, motion, radius, space, touch } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { CountdownRing } from './CountdownRing';
import { doneChime, keepScreenOn, say, softChime, stopSpeaking } from './feedback';
import { useOnPeriod, useYogaPrefs } from './hooks';
import {
  FEEL_LABEL,
  LEVELS,
  LEVEL_LABEL,
  buildPlaylist,
  formatClock,
  intensityFor,
  isComplete,
  sessionCautions,
  suggestLevelFromFeel,
  type Feel,
  type PlayStep,
} from './logic';
import { getProgram } from './programs';
import { PoseFigure } from './PoseFigure';
import { SafetySheet } from './SafetySheet';
import { savePrefs, yogaHistory, loadPrefs } from './store';

const READY_MS = 5000;
const TICK_MS = 250;

type Phase = 'intro' | 'ready' | 'pose' | 'done';

export function SessionPlayer({
  sessionId,
  programId,
  programDay,
  skipIntro,
}: {
  sessionId: string;
  programId?: string;
  programDay?: number;
  skipIntro?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const onPeriod = useOnPeriod();
  const { prefs, loaded, update } = useYogaPrefs();

  const session = SESSIONS.find((s) => s.id === sessionId) ?? null;
  const playlist = useMemo(
    () => (session ? buildPlaylist(session, POSES, { onPeriod }) : { steps: [], skippedForPeriod: [], totalSeconds: 0 }),
    [session, onPeriod]
  );
  const steps = playlist.steps;
  const cautions = useMemo(() => (session ? sessionCautions(session, POSES) : []), [session]);

  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(READY_MS);
  const [easier, setEasier] = useState(false);
  const [showSafety, setShowSafety] = useState(false);

  /** Seconds actually held, per step index. */
  const played = useRef<number[]>([]);
  const endAt = useRef<number>(0);
  const phaseStartMs = useRef<number>(READY_MS);

  const step: PlayStep | undefined = steps[index];
  const playedSeconds = () => played.current.reduce((a, b) => a + (b || 0), 0);

  // Keep the screen awake for the whole player; stop speech on leave.
  useEffect(() => {
    keepScreenOn(true);
    return () => {
      keepScreenOn(false);
      stopSpeaking();
    };
  }, []);

  // Skip the intro when coming from the detail screen (cautions already shown).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!loaded || autoStarted.current || !session) return;
    if (skipIntro && prefs.disclaimerSeen) {
      autoStarted.current = true;
      beginReady(0, true);
    } else if (!prefs.disclaimerSeen) {
      setShowSafety(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, session]);

  /* ----------------------------- transitions ---------------------------- */

  const cue = useCallback(
    (text: string) => {
      if (prefs.voice) say(text);
    },
    [prefs.voice]
  );
  const tap = useCallback(() => {
    if (prefs.haptics) softChime();
  }, [prefs.haptics]);

  const sideWord = (s?: PlayStep) => (s?.side ? `, ${s.side} side` : '');

  function startTimer(ms: number) {
    phaseStartMs.current = ms;
    endAt.current = Date.now() + ms;
    setRemainingMs(ms);
    setRunning(true);
  }

  function beginReady(i: number, first = false) {
    const next = steps[i];
    if (!next) return finish();
    setIndex(i);
    setEasier(!!next.periodModified);
    setPhase('ready');
    startTimer(READY_MS);
    const name = next.pose?.name ?? 'next pose';
    cue(first ? `Get ready. First up: ${name}${sideWord(next)}.` : `Next up: ${name}${sideWord(next)}.`);
  }

  function beginPose(i: number) {
    const s = steps[i];
    if (!s) return finish();
    setIndex(i);
    setPhase('pose');
    startTimer(s.seconds * 1000);
    tap();
    const firstCue = s.periodModified && s.pose?.modification ? s.pose.modification : s.pose?.steps[0] ?? '';
    cue(`${s.pose?.name ?? 'Pose'}${sideWord(s)}. ${firstCue}`);
  }

  /** Records how long the current pose was held. */
  function recordCurrent(full: boolean) {
    if (phase !== 'pose' || !step) return;
    const held = full ? step.seconds : Math.max(0, step.seconds - remainingMs / 1000);
    played.current[index] = Math.max(played.current[index] ?? 0, Math.min(step.seconds, held));
  }

  function goNext() {
    recordCurrent(false);
    if (phase === 'ready') return beginPose(index);
    if (index >= steps.length - 1) return finish();
    beginReady(index + 1);
  }

  function goPrev() {
    recordCurrent(false);
    // Mid-pose → restart it; at its very start (or while getting ready) → previous pose.
    const elapsed = phaseStartMs.current - remainingMs;
    const i = phase === 'pose' && elapsed > 3000 ? index : Math.max(0, index - 1);
    beginPose(i);
  }

  /** Skip the whole pose (both sides), without counting its time. */
  function skipPose() {
    if (!step) return;
    let j = index + 1;
    while (j < steps.length && steps[j].poseId === step.poseId && step.side) j++;
    if (j >= steps.length) return finish();
    beginReady(j);
  }

  // Tick
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const left = endAt.current - Date.now();
      if (left > 0) {
        setRemainingMs(left);
        return;
      }
      setRemainingMs(0);
      setRunning(false);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  // Phase end
  useEffect(() => {
    if (running || remainingMs > 0) return;
    if (phase === 'ready') beginPose(index);
    else if (phase === 'pose') {
      recordCurrent(true);
      if (index >= steps.length - 1) finish();
      else beginReady(index + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, remainingMs]);

  function togglePause() {
    if (phase !== 'ready' && phase !== 'pose') return;
    if (running) {
      setRunning(false);
      setRemainingMs(Math.max(0, endAt.current - Date.now()));
    } else {
      endAt.current = Date.now() + remainingMs;
      setRunning(true);
    }
  }

  /* ------------------------------ completion ---------------------------- */

  const [result, setResult] = useState<{
    saved: boolean;
    historyId: number | null;
    minutes: number;
    poses: number;
  } | null>(null);
  const finishing = useRef(false);

  async function finish() {
    if (finishing.current || !session) return;
    finishing.current = true;
    setRunning(false);
    setPhase('done');
    stopSpeaking();
    const secs = playedSeconds();
    const minutes = secs / 60;
    const poses = new Set(steps.filter((_, i) => (played.current[i] ?? 0) > 0).map((s) => s.poseId)).size;
    const complete = isComplete(secs, playlist.totalSeconds);
    let historyId: number | null = null;
    if (complete) {
      if (prefs.haptics) doneChime();
      cue('Well done. Session complete.');
      const level: YogaLevel = session.level;
      const day = todayKey();
      try {
        historyId = await yogaHistory.add({
          day,
          sessionId: session.id,
          title: session.title,
          level,
          minutes,
          poses,
          fraction: secs / playlist.totalSeconds,
          programId: programId ?? null,
          programDay: programDay ?? null,
        });
      } catch {
        historyId = null;
      }
      try {
        await addActivity({
          type: 'yoga',
          title: session.title,
          minutes: Math.max(1, Math.round(minutes)),
          intensity: intensityFor(session.level, session.goal),
          dateKey: day,
          source: 'bloom-yoga',
        });
      } catch {
        // activity log is best-effort; yoga history is already saved
      }
      if (programId && programDay !== undefined && getProgram(programId)) {
        const p = await loadPrefs();
        const prog =
          p.program?.programId === programId ? p.program : { programId, startedDay: day, completed: [] as number[] };
        if (!prog.completed.includes(programDay)) {
          await savePrefs({ program: { ...prog, completed: [...prog.completed, programDay].sort((a, b) => a - b) } });
        }
      }
    }
    setResult({ saved: complete, historyId, minutes, poses });
  }

  function confirmExit() {
    if (phase === 'done' || phase === 'intro') return leave();
    const wasRunning = running;
    if (running) togglePause();
    const enough = isComplete(playedSeconds(), playlist.totalSeconds);
    Alert.alert(
      'End session?',
      enough ? 'You’ve done most of it — Bloom will save it as complete.' : 'This session won’t be saved yet.',
      [
        { text: 'Keep going', style: 'cancel', onPress: () => wasRunning && togglePause() },
        { text: 'End', style: 'destructive', onPress: () => (enough ? finish() : leave()) },
      ]
    );
  }

  function leave() {
    stopSpeaking();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/yoga');
  }

  // Android back button → confirm.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmExit();
      return true;
    });
    return () => sub.remove();
  });

  /* --------------------------------- UI --------------------------------- */

  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    fade.setValue(0.4);
    Animated.timing(fade, { toValue: 1, duration: motion.base, useNativeDriver: true }).start();
  }, [index, phase, reduced, fade]);

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: space.md, paddingTop: insets.top + space.md, gap: space.md }}>
        <IconButton icon={X} accessibilityLabel="Close" onPress={leave} />
        <Text variant="title">Session not found</Text>
        <Button label="Back to yoga" onPress={() => router.replace('/(tabs)/yoga')} />
      </View>
    );
  }

  const topBar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <IconButton icon={X} accessibilityLabel="End session" onPress={confirmExit} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        {phase === 'ready' || phase === 'pose' ? (
          <Text variant="caption" tone="muted" accessibilityLabel={`Pose ${index + 1} of ${steps.length}`}>
            {index + 1} / {steps.length}
          </Text>
        ) : null}
      </View>
      <IconButton
        icon={prefs.haptics ? Vibrate : VibrateOff}
        accessibilityLabel={prefs.haptics ? 'Vibration cues on. Turn off' : 'Vibration cues off. Turn on'}
        onPress={() => update({ haptics: !prefs.haptics })}
      />
      <IconButton
        icon={prefs.voice ? Volume2 : VolumeX}
        accessibilityLabel={prefs.voice ? 'Voice cues on. Turn off' : 'Voice cues off. Turn on'}
        onPress={() => {
          if (prefs.voice) stopSpeaking();
          update({ voice: !prefs.voice });
        }}
      />
    </View>
  );

  const progressBar = (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${Math.round(((index + (phase === 'pose' ? 1 - remainingMs / (step ? step.seconds * 1000 : 1) : 0)) / Math.max(1, steps.length)) * 100)}%`,
          height: 6,
          backgroundColor: c.cycle,
        }}
      />
    </View>
  );

  /* ---------------- intro ---------------- */
  if (phase === 'intro') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView contentContainerStyle={{ padding: space.md, paddingTop: insets.top + space.md, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
          {topBar}
          <Text variant="display" accessibilityRole="header">
            {session.title}
          </Text>
          <Text tone="muted">
            {session.minutes} min · {LEVEL_LABEL[session.level]} · {steps.length} steps
          </Text>
          {onPeriod ? <PeriodNote skipped={playlist.skippedForPeriod.map((p) => p.name)} /> : null}
          {cautions.length ? <CautionsCard cautions={cautions} /> : null}
          <Button
            label="Begin"
            icon={Play}
            accessibilityHint="Starts a 5-second get-ready countdown"
            onPress={() => (prefs.disclaimerSeen ? beginReady(0, true) : setShowSafety(true))}
            disabled={!steps.length}
          />
        </ScrollView>
        <SafetySheet
          visible={showSafety}
          onClose={() => setShowSafety(false)}
          onAccept={() => {
            setShowSafety(false);
            update({ disclaimerSeen: true });
          }}
        />
      </View>
    );
  }

  /* ---------------- done ---------------- */
  if (phase === 'done') {
    return <CompletionView session={session} result={result} onClose={leave} />;
  }

  /* ---------------- ready / pose ---------------- */
  const isReady = phase === 'ready';
  const pose = step?.pose ?? null;
  const total = isReady ? READY_MS : (step?.seconds ?? 1) * 1000;
  const secsLeft = Math.ceil(remainingMs / 1000);
  const showEasier = easier && !!pose?.modification;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: space.md,
          paddingTop: insets.top + space.md,
          paddingBottom: insets.bottom + space.xl,
          gap: space.md,
        }}
      >
        {topBar}
        {progressBar}

        <Animated.View style={{ alignItems: 'center', gap: space.sm, opacity: fade }}>
          <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }} accessibilityLiveRegion="polite">
            {isReady ? (index === 0 ? 'Get ready' : 'Next up') : 'Hold'}
          </Text>
          <CountdownRing
            fraction={remainingMs / total}
            size={260}
            color={isReady ? c.sleep : c.cycle}
            accessibilityLabel={`${isReady ? 'Starting in' : 'Time left'} ${secsLeft} seconds`}
          >
            {step ? <PoseFigure poseId={step.poseId} pose={pose} size={188} flip={step.side === 'right'} /> : null}
          </CountdownRing>
          <Text
            style={{ fontFamily: fonts.display, fontSize: 56, lineHeight: 60, color: c.ink }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {isReady ? secsLeft : formatClock(remainingMs / 1000)}
          </Text>
          <Text variant="display" style={{ textAlign: 'center' }} accessibilityRole="header">
            {pose?.name ?? 'Pose'}
          </Text>
          {pose?.sanskrit ? (
            <Text tone="muted" style={{ fontFamily: fonts.displayItalic, fontSize: 22, lineHeight: 28, textAlign: 'center' }}>
              {pose.sanskrit}
            </Text>
          ) : null}
          {step?.side ? (
            <View
              accessible
              accessibilityLabel={step.side === 'left' ? 'Left side' : 'Right side'}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: space.md,
                paddingVertical: space.xs,
                borderRadius: radius.pill,
                backgroundColor: c.cycleSoft,
              }}
            >
              {step.side === 'left' ? <ArrowLeft size={18} color={c.ink} /> : null}
              <Text variant="bodyStrong">{step.side === 'left' ? 'Left side' : 'Right side'}</Text>
              {step.side === 'right' ? <ArrowRight size={18} color={c.ink} /> : null}
            </View>
          ) : null}
        </Animated.View>

        {/* Controls */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
          <IconButton icon={SkipBack} accessibilityLabel="Previous pose" onPress={goPrev} disabled={index === 0 && phase === 'ready'} />
          <Pressable
            onPress={togglePause}
            accessibilityRole="button"
            accessibilityLabel={running ? 'Pause' : 'Resume'}
            android_ripple={{ color: '#ffffff33', borderless: true }}
            style={({ pressed }) => ({
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: c.ink,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {running ? <Pause size={32} color={c.onInk} /> : <Play size={32} color={c.onInk} />}
          </Pressable>
          <IconButton icon={SkipForward} accessibilityLabel={isReady ? 'Start pose now' : 'Next pose'} onPress={goNext} />
        </View>
        {!running ? (
          <Text tone="muted" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
            Paused
          </Text>
        ) : null}
        <Button variant="ghost" label="Skip this pose" onPress={skipPose} accessibilityHint="Moves on without counting this pose" />

        {/* Easier version */}
        {pose?.modification ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.min }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Make it easier</Text>
                {step?.periodModified ? (
                  <Text variant="caption" tone="muted">
                    On for your period
                  </Text>
                ) : null}
              </View>
              <Switch
                value={easier}
                onValueChange={setEasier}
                accessibilityLabel="Make it easier"
                accessibilityHint="Shows a gentler version of this pose"
                trackColor={{ false: c.line, true: c.cycle }}
                thumbColor={c.surface}
                style={{ minWidth: 48, minHeight: 48 }}
              />
            </View>
            {showEasier ? (
              <Text style={{ marginTop: space.xs }} accessibilityLiveRegion="polite">
                {pose.modification}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* Cues */}
        {pose?.steps.length ? (
          <Card>
            <Text variant="label" tone="muted" style={{ textTransform: 'uppercase', marginBottom: space.xs }}>
              How to
            </Text>
            <View style={{ gap: space.xs }}>
              {pose.steps.map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                  <Text variant="bodyStrong" style={{ width: 20 }}>
                    {i + 1}.
                  </Text>
                  <Text style={{ flex: 1 }}>{s}</Text>
                </View>
              ))}
            </View>
            {step?.note ? (
              <Text tone="muted" style={{ marginTop: space.sm }}>
                {step.note}
              </Text>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

/* ------------------------------ Pieces ------------------------------ */

export function PeriodNote({ skipped }: { skipped: string[] }) {
  const { c } = useTheme();
  return (
    <Card tint={c.cycleSoft}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Flower2 size={22} color={c.cycle} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodyStrong">Gentle mode for your period</Text>
          <Text>
            Poses that are best avoided right now use their easier version
            {skipped.length ? `, and these are left out: ${skipped.join(', ')}` : ''}. Rest whenever you like.
          </Text>
        </View>
      </View>
    </Card>
  );
}

export function CautionsCard({ cautions }: { cautions: string[] }) {
  return (
    <Card>
      <Text variant="heading" accessibilityRole="header">
        Take care
      </Text>
      <View style={{ gap: space.xs, marginTop: space.xs }}>
        {cautions.map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.xs }}>
            <Text>•</Text>
            <Text style={{ flex: 1 }}>{t}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function CompletionView({
  session,
  result,
  onClose,
}: {
  session: (typeof SESSIONS)[number];
  result: { saved: boolean; historyId: number | null; minutes: number; poses: number } | null;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, update } = useYogaPrefs();
  const [feel, setFeel] = useState<Feel | null>(null);
  const [suggestion, setSuggestion] = useState<YogaLevel | null>(null);

  const answer = async (f: Feel) => {
    setFeel(f);
    if (!result?.historyId) return;
    try {
      await yogaHistory.setFeel(result.historyId, f);
      const recent = await yogaHistory.recentFeels(prefs.feelResetAfterId);
      setSuggestion(suggestLevelFromFeel(recent, prefs.level ?? session.level));
    } catch {
      // ignore
    }
  };

  const resolveSuggestion = async (accept: boolean) => {
    const lastId = await yogaHistory.lastId().catch(() => 0);
    await update({ feelResetAfterId: lastId, ...(accept && suggestion ? { level: suggestion } : {}) });
    setSuggestion(null);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: space.md, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl, gap: space.md }}
    >
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <View
          importantForAccessibility="no-hide-descendants"
          style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.cycleSoft, alignItems: 'center', justifyContent: 'center' }}
        >
          <Flower2 size={44} color={c.cycle} />
        </View>
        <Text variant="display" accessibilityRole="header" style={{ textAlign: 'center' }}>
          {result?.saved ? 'Well done' : 'Session ended'}
        </Text>
        <Text tone="muted" style={{ textAlign: 'center' }}>
          {session.title}
        </Text>
      </View>

      <Card accessibilityLabel={`${Math.round(result?.minutes ?? 0)} minutes, ${result?.poses ?? 0} poses`}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="display">{Math.max(0, Math.round(result?.minutes ?? 0))}</Text>
            <Text tone="muted">minutes</Text>
          </View>
          <View style={{ width: 1, backgroundColor: c.line }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="display">{result?.poses ?? 0}</Text>
            <Text tone="muted">poses</Text>
          </View>
        </View>
      </Card>

      {result?.saved ? (
        <>
          <Text tone="muted" style={{ textAlign: 'center' }}>
            Saved to your yoga history and today’s activity.
          </Text>
          <Card>
            <Text variant="heading" accessibilityRole="header">
              How did it feel?
            </Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: space.xs, marginTop: space.sm }}>
              {(Object.keys(FEEL_LABEL) as Feel[]).map((f) => {
                const selected = feel === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => answer(f)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={FEEL_LABEL[f]}
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: 52,
                      borderRadius: radius.chip,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? c.ink : c.line,
                      backgroundColor: selected ? c.cycleSoft : c.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text variant={selected ? 'bodyStrong' : 'body'}>{FEEL_LABEL[f]}</Text>
                  </Pressable>
                );
              })}
            </View>
            {feel && !suggestion ? (
              <Text tone="muted" style={{ marginTop: space.sm }} accessibilityLiveRegion="polite">
                Thanks — noted.
              </Text>
            ) : null}
          </Card>
          {suggestion ? (
            <Card tint={c.sleepSoft}>
              <Text variant="bodyStrong" accessibilityLiveRegion="polite">
                {LEVELS.indexOf(suggestion) < LEVELS.indexOf(prefs.level ?? session.level)
                  ? `The last few sessions felt hard. Try ${LEVEL_LABEL[suggestion]} for a while?`
                  : `The last few sessions felt easy. Ready to try ${LEVEL_LABEL[suggestion]}?`}
              </Text>
              <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.sm }}>
                <Button label={`Switch to ${LEVEL_LABEL[suggestion]}`} onPress={() => resolveSuggestion(true)} style={{ flex: 1 }} />
                <Button label="Not now" variant="secondary" onPress={() => resolveSuggestion(false)} />
              </View>
            </Card>
          ) : null}
        </>
      ) : (
        <Text tone="muted" style={{ textAlign: 'center' }}>
          Bloom saves a session once you’ve done most of it (60 %). Any movement still counts for you.
        </Text>
      )}

      <Button label="Done" onPress={onClose} />
      {!result?.saved ? <Chip label="Not saved" /> : null}
    </ScrollView>
  );
}
