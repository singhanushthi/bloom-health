/**
 * "Connect watch directly (beta)": reads heart rate straight from a watch over standard
 * Bluetooth LE (Heart Rate Service 0x180D) — no companion app needed, when the watch
 * supports it. Honest about limits: many budget watches don't share heart rate this way.
 */
import { router } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  BatteryMedium,
  Bluetooth,
  BluetoothOff,
  BluetoothSearching,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  HeartPulse,
  Info,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlink,
  Watch,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Button, Card, Chip, IconButton, Text } from '../components/ui';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { radius, space, touch } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { openBluetoothSettings, type ScannedWatch } from '../watch/ble';
import { LiveSparkline, SignalBars } from '../watch/components';
import { formatClock, rssiToSignal } from '../watch/parse';
import {
  clearProblem,
  connectTo,
  disconnect,
  forget,
  reconnectNow,
  startScan,
  stopScan,
  type WatchProblem,
  type WatchState,
} from '../watch/controller';
import { WATCH_SOURCE_LABEL } from '../watch/storage';
import { useWatch } from '../watch/useWatch';

const EXPLAINER =
  'Works if your watch shares heart rate using the standard Bluetooth heart-rate signal. Many budget watches, including some Noise models, don’t — and steps, sleep and SpO2 can’t be read this way. If your watch connects here, you can track heart rate without NoiseFit.';
const EXPLAINER_NOTE =
  'Note: without NoiseFit your watch may not sync time, notifications or firmware updates.';

/** Announce live BPM to screen readers at most this often. */
const ANNOUNCE_MS = 15_000;

/** Re-render every second while `active` (for countdowns). */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function WatchScreen() {
  const { c } = useTheme();
  const w = useWatch();
  const unsupported = w.problem === 'unsupported' || w.radio === 'unsupported';
  const scanning = w.phase === 'scanning';
  const now = useTicker(scanning || w.phase === 'reconnecting');
  const secondsLeft = w.scanEndsAt ? Math.max(0, Math.ceil((w.scanEndsAt - now) / 1000)) : 0;
  const [scannedOnce, setScannedOnce] = useState(false);
  const showConnected = !!w.connected && (w.phase === 'connected' || w.phase === 'scanning');

  const onScan = () => {
    setScannedOnce(true);
    void startScan();
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconButton
          icon={ArrowLeft}
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/connect'))}
        />
      </View>
      <View style={{ gap: space.xs }}>
        <Chip label="Beta" icon={Bluetooth} bg={c.sleepSoft} iconColor={c.sleep} />
        <Text variant="display" accessibilityRole="header">
          Connect watch directly
        </Text>
      </View>

      {/* Explainer */}
      <Card tint={c.surfaceAlt}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Info size={22} color={c.ink} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: space.xs }}>
            <Text>{EXPLAINER}</Text>
            <Text tone="muted">{EXPLAINER_NOTE}</Text>
          </View>
        </View>
      </Card>

      {unsupported ? (
        <UnsupportedCard />
      ) : (
        <>
          {w.problem ? <ProblemCard problem={w.problem} /> : null}

          {showConnected ? <ConnectedCard w={w} /> : null}
          {!showConnected && w.remembered && (w.phase === 'reconnecting' || w.phase === 'connecting') ? (
            <ReconnectingCard w={w} now={now} />
          ) : null}
          {!showConnected && w.remembered && w.phase === 'idle' ? <RememberedCard w={w} /> : null}

          {!showConnected ? <BeforeYouScan /> : null}

          <Card>
            <Text variant="heading" accessibilityRole="header">
              {showConnected ? 'Switch to another watch' : 'Find your watch'}
            </Text>
            <Text tone="muted" style={{ marginTop: space.xxs }}>
              Bloom looks for nearby Bluetooth devices for 15 seconds. Watches that share heart rate are listed first.
            </Text>
            {scanning ? (
              <View style={{ marginTop: space.md, gap: space.sm }}>
                <ScanningRow secondsLeft={secondsLeft} />
                <Button variant="secondary" label="Stop scanning" onPress={stopScan} />
              </View>
            ) : (
              <Button
                label={scannedOnce ? 'Scan again' : 'Scan for my watch'}
                icon={BluetoothSearching}
                variant={showConnected ? 'secondary' : 'primary'}
                loading={w.phase === 'connecting'}
                onPress={onScan}
                accessibilityHint="Searches for nearby Bluetooth watches for 15 seconds"
                style={{ marginTop: space.md }}
              />
            )}
            <DeviceList devices={w.devices} scanning={scanning} scannedOnce={scannedOnce} connectedId={w.connected?.id ?? null} />
          </Card>

          <Troubleshooting />
        </>
      )}

      <FallbackCard />

      <Card tint={c.spo2Soft}>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <ShieldCheck size={22} color={c.spo2} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            Readings go straight from your watch to this phone. Nothing is uploaded.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

/* -------------------------------- Pieces -------------------------------- */

function UnsupportedCard() {
  const { c } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        <BluetoothOff size={22} color={c.muted} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" accessibilityLiveRegion="polite">
            Bluetooth isn’t available on this device
          </Text>
          <Text tone="muted" style={{ marginTop: 2 }}>
            This phone (or emulator) can’t use Bluetooth Low Energy, so Bloom can’t talk to a watch directly.
          </Text>
        </View>
      </View>
    </Card>
  );
}

const PROBLEM_COPY: Record<Exclude<WatchProblem, null | 'unsupported'>, { title: string; body: string }> = {
  'bluetooth-off': {
    title: 'Bluetooth is off',
    body: 'Turn Bluetooth on, then come back and scan again.',
  },
  'permission-denied': {
    title: 'Bloom needs permission to find nearby devices',
    body: 'Android asks before an app can look for Bluetooth devices. Bloom only uses it to talk to your watch.',
  },
  'permission-blocked': {
    title: 'Nearby devices permission is turned off',
    body: 'Open Bloom’s app settings → Permissions → Nearby devices, and allow it.',
  },
  'connect-failed': {
    title: 'Couldn’t connect to the watch',
    body: 'Close NoiseFit (or unpair the watch there) — most watches allow only one connection at a time. Keep the watch close and try again.',
  },
  'scan-failed': {
    title: 'Scanning stopped unexpectedly',
    body: 'Check that Bluetooth is on and try again. Restarting Bluetooth often helps.',
  },
};

function ProblemCard({ problem }: { problem: Exclude<WatchProblem, null> }) {
  const { c } = useTheme();
  if (problem === 'unsupported') return null;
  const copy = PROBLEM_COPY[problem];
  return (
    <Card tint={c.heartSoft}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        {problem === 'bluetooth-off' ? (
          <BluetoothOff size={22} color={c.ink} style={{ marginTop: 2 }} />
        ) : (
          <CircleAlert size={22} color={c.ink} style={{ marginTop: 2 }} />
        )}
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" accessibilityLiveRegion="polite">
            {copy.title}
          </Text>
          <Text style={{ marginTop: 2 }}>{copy.body}</Text>
        </View>
      </View>
      <View style={{ gap: space.xs, marginTop: space.md }}>
        {problem === 'bluetooth-off' ? (
          <Button label="Turn on Bluetooth" icon={Bluetooth} onPress={() => void openBluetoothSettings()} accessibilityHint="Opens Bluetooth settings" />
        ) : problem === 'permission-blocked' ? (
          <Button label="Open app settings" onPress={() => Linking.openSettings().catch(() => {})} accessibilityHint="Opens Bloom's Android settings" />
        ) : (
          <Button
            label="Try again"
            icon={RefreshCw}
            onPress={() => {
              clearProblem();
              void startScan();
            }}
          />
        )}
        <Button variant="ghost" label="Dismiss" onPress={clearProblem} />
      </View>
    </Card>
  );
}

function ScanningRow({ secondsLeft }: { secondsLeft: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 300, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(500),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return (
    <View
      accessible
      accessibilityLabel={`Scanning for watches, ${secondsLeft} seconds left`}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
    >
      <Animated.View style={{ opacity: pulse }}>
        <BluetoothSearching size={22} color={c.sleep} />
      </Animated.View>
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        Scanning… {secondsLeft}s
      </Text>
    </View>
  );
}

function DeviceList({
  devices,
  scanning,
  scannedOnce,
  connectedId,
}: {
  devices: ScannedWatch[];
  scanning: boolean;
  scannedOnce: boolean;
  connectedId: string | null;
}) {
  const { c } = useTheme();
  const list = devices.filter((d) => d.id !== connectedId);
  if (!list.length) {
    if (!scannedOnce || scanning) return null;
    return (
      <View style={{ marginTop: space.md }}>
        <Text variant="bodyStrong">No devices found</Text>
        <Text tone="muted" style={{ marginTop: 2 }}>
          Start a workout on the watch (or turn on heart-rate sharing), close NoiseFit, keep the watch next to the phone, then scan again.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ marginTop: space.md, gap: space.xs }} accessibilityLabel="Nearby devices">
      <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }}>
        Nearby ({list.length})
      </Text>
      {list.map((d) => (
        <Pressable
          key={d.id}
          onPress={() => void connectTo(d.id, d.name)}
          accessibilityRole="button"
          accessibilityLabel={`${d.name}. ${d.advertisesHeartRate ? 'Shares heart rate. ' : ''}Signal ${rssiWord(d.rssi)}. Connect`}
          android_ripple={{ color: c.line }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            minHeight: 64,
            paddingHorizontal: space.sm,
            paddingVertical: space.xs,
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: d.advertisesHeartRate ? c.heart : c.line,
            backgroundColor: d.advertisesHeartRate ? c.heartSoft : c.surface,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View
            importantForAccessibility="no-hide-descendants"
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
          >
            {d.advertisesHeartRate ? <HeartPulse size={20} color={c.heart} /> : <Watch size={20} color={c.muted} />}
          </View>
          <View style={{ flex: 1, gap: 2 }} importantForAccessibility="no-hide-descendants">
            <Text variant="bodyStrong" numberOfLines={1}>
              {d.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              {d.advertisesHeartRate ? (
                <Text variant="caption">Shares heart rate</Text>
              ) : null}
              <SignalBars rssi={d.rssi} />
            </View>
          </View>
          <ChevronRight size={20} color={c.muted} />
        </Pressable>
      ))}
    </View>
  );
}

const rssiWord = (rssi: number | null) => rssiToSignal(rssi).label.toLowerCase();

function ConnectedCard({ w }: { w: WatchState }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const d = w.connected!;
  const live = w.live;
  const fresh = live && Date.now() - live.at < 10_000;

  // Screen-reader text for the live value changes at most every 15 s.
  const [announce, setAnnounce] = useState<string>('Waiting for heart rate');
  const lastAnnounce = useRef(0);
  const liveText = !d.hasHeartRate
    ? 'Heart rate not available from this watch'
    : live?.usable
      ? `Heart rate ${live.bpm} beats per minute`
      : live?.contact === 'not-detected'
        ? 'Watch isn’t touching your skin'
        : 'Waiting for heart rate';
  useEffect(() => {
    const t = Date.now();
    if (t - lastAnnounce.current >= ANNOUNCE_MS || announce === 'Waiting for heart rate') {
      lastAnnounce.current = t;
      setAnnounce(liveText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveText]);

  const subtitle = [d.manufacturer, d.model].filter(Boolean).join(' · ');

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View
          importantForAccessibility="no-hide-descendants"
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.heartSoft, alignItems: 'center', justifyContent: 'center' }}
        >
          <Watch size={24} color={c.heart} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="heading" accessibilityRole="header" numberOfLines={1}>
            {d.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle || 'Connected over Bluetooth'}
            {d.firmware ? ` · firmware ${d.firmware}` : ''}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm }}>
        <Chip label="Connected" icon={Bluetooth} bg={c.spo2Soft} iconColor={c.spo2} />
        <Chip label={d.battery != null ? `Battery ${d.battery}%` : 'Battery unknown'} icon={BatteryMedium} />
      </View>

      {d.hasHeartRate ? (
        <>
          <View
            accessible
            accessibilityLabel={announce}
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, marginTop: space.md }}
          >
            <HeartPulse size={28} color={c.heart} style={{ marginBottom: 10 }} />
            <Text variant="hero">{live?.usable && fresh ? live.bpm : '––'}</Text>
            <Text variant="bodyStrong" tone="muted" style={{ marginBottom: 10 }}>
              bpm
            </Text>
          </View>
          <Text tone="muted">
            {live?.usable && fresh
              ? 'Live from your watch'
              : live?.contact === 'not-detected'
                ? 'The watch says it isn’t touching your skin. Wear it snugly.'
                : 'Waiting for heart rate… Start a workout on the watch or turn on heart-rate sharing.'}
          </Text>
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ marginTop: space.sm }}>
            <LiveSparkline values={w.recent} width={width} color={c.heart} />
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: space.xxs }}>
            {w.lastSaved
              ? `Last saved: ${w.lastSaved.bpm} bpm at ${formatClock(new Date(w.lastSaved.time))} · one reading a minute · ${WATCH_SOURCE_LABEL}`
              : 'Bloom saves one reading a minute (the middle value) while connected.'}
          </Text>
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
          <CircleAlert size={20} color={c.ink} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1 }}>
            This watch connected, but it doesn’t share heart rate using the standard Bluetooth signal. Bloom can’t read it this way —
            use NoiseFit → Google Fit / Google Health → Health Connect instead.
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.md, flexWrap: 'wrap' }}>
        <Button variant="secondary" icon={Unlink} label="Disconnect" onPress={() => void disconnect()} style={{ flexGrow: 1 }} />
        <Button
          variant="ghost"
          icon={Trash2}
          label="Forget"
          accessibilityLabel={`Forget ${d.name}`}
          accessibilityHint="Disconnects and stops Bloom reconnecting to this watch"
          onPress={() => void forget()}
          style={{ flexGrow: 1 }}
        />
      </View>
    </Card>
  );
}

function ReconnectingCard({ w, now }: { w: WatchState; now: number }) {
  const { c } = useTheme();
  const name = w.remembered!.name;
  const secs = w.nextRetryAt ? Math.max(0, Math.ceil((w.nextRetryAt - now) / 1000)) : 0;
  const label = w.phase === 'connecting' ? `Connecting to ${name}…` : `Lost connection to ${name}. Trying again in ${secs}s.`;
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <BluetoothSearching size={22} color={c.sleep} />
        <Text variant="bodyStrong" style={{ flex: 1 }} accessibilityLiveRegion="polite">
          {label}
        </Text>
      </View>
      <Text tone="muted" style={{ marginTop: space.xxs }}>
        Keep the watch near the phone. Bloom keeps trying while it’s open.
      </Text>
      <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.md, flexWrap: 'wrap' }}>
        {w.phase === 'reconnecting' ? (
          <Button variant="secondary" icon={RefreshCw} label="Try now" onPress={() => void reconnectNow()} style={{ flexGrow: 1 }} />
        ) : null}
        <Button variant="ghost" icon={Unlink} label="Stop" accessibilityHint="Stops reconnecting" onPress={() => void disconnect()} style={{ flexGrow: 1 }} />
      </View>
    </Card>
  );
}

function RememberedCard({ w }: { w: WatchState }) {
  const { c } = useTheme();
  const r = w.remembered!;
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <View
          importantForAccessibility="no-hide-descendants"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
        >
          <Watch size={22} color={c.muted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="heading" numberOfLines={1}>
            {r.name}
          </Text>
          <Text variant="caption" tone="muted">
            Not connected
            {w.lastSaved ? ` · last saved ${w.lastSaved.bpm} bpm at ${formatClock(new Date(w.lastSaved.time))}` : ''}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.md, flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          icon={Bluetooth}
          label="Connect"
          accessibilityLabel={`Connect to ${r.name}`}
          onPress={() => void reconnectNow()}
          style={{ flexGrow: 1 }}
        />
        <Button variant="ghost" icon={Trash2} label="Forget" accessibilityLabel={`Forget ${r.name}`} onPress={() => void forget()} style={{ flexGrow: 1 }} />
      </View>
    </Card>
  );
}

const STEPS = [
  'On the watch, start a workout or turn on ‘HR broadcast’ / ‘Heart rate sharing’ if it has one.',
  'Close NoiseFit, or unpair the watch there — a watch often allows only one connection at a time.',
  'Keep the watch close to your phone, then tap Scan.',
];

function BeforeYouScan() {
  const { c } = useTheme();
  return (
    <Card>
      <Text variant="heading" accessibilityRole="header">
        Before you scan
      </Text>
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {STEPS.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm }} accessible accessibilityLabel={`Step ${i + 1}: ${s}`}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: c.cycleSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="caption">{i + 1}</Text>
            </View>
            <Text style={{ flex: 1 }}>{s}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const TROUBLE = [
  'Unpair the watch from NoiseFit or close NoiseFit — the watch may only talk to one app at a time.',
  'Make sure Bluetooth is on and Bloom is allowed to find nearby devices.',
  'Keep the watch within a metre or two of the phone.',
  'Restart the watch, then scan again.',
  'Still nothing? Your watch probably doesn’t share heart rate over standard Bluetooth.',
];

function Troubleshooting() {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Troubleshooting"
        android_ripple={{ color: c.line }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          minHeight: touch.min,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <LifeBuoy size={22} color={c.ink} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          Troubleshooting
        </Text>
        {open ? <ChevronUp size={22} color={c.ink} /> : <ChevronDown size={22} color={c.ink} />}
      </Pressable>
      {open ? (
        <View style={{ gap: space.xs, marginTop: space.xs }}>
          {TROUBLE.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space.xs }}>
              <Text tone="muted" importantForAccessibility="no">
                •
              </Text>
              <Text style={{ flex: 1 }}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function FallbackCard() {
  const { c } = useTheme();
  return (
    <Card tint={c.cycleSoft}>
      <Text variant="bodyStrong">Didn’t work? Use NoiseFit → Google Fit/Google Health → Health Connect instead</Text>
      <Text style={{ marginTop: space.xxs }}>
        That route brings in steps, sleep, heart rate and SpO₂ — everything your watch records.
      </Text>
      <Button
        variant="secondary"
        icon={ArrowRight}
        label="Connect through Health Connect"
        accessibilityHint="Opens Connect your apps"
        onPress={() => router.push('/connect')}
        style={{ marginTop: space.md }}
      />
    </Card>
  );
}
