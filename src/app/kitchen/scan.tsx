/**
 * Barcode scan (EAN-13 / EAN-8 / UPC) → Open Food Facts lookup → product form.
 * The camera permission is requested only when the user taps "Start scanning".
 * A typed barcode works too (no camera needed).
 */
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { Camera, Keyboard, PackageOpen, ScanBarcode } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { DemoBanner } from '../../components/DemoBanner';
import { Screen } from '../../components/Screen';
import { Field, Input } from '../../components/sheets/Sheet';
import { Button, Card, CardHeader, Text } from '../../components/ui';
import { setPendingProduct } from '../../kitchen/handoff';
import { isValidBarcode, lookupBarcode, productToDraft } from '../../kitchen/off';
import { useFoodColors } from '../../kitchen/ui/parts';
import { BackHeader } from '../../plan/ui/parts';
import { radius, space } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export default function ScanProduct() {
  const { c } = useTheme();
  const f = useFoodColors();
  // Reads the current status only — never prompts by itself.
  const [perm, requestPerm] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  const locked = useRef(false);

  const handle = useCallback(async (code: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    const r = await lookupBarcode(code);
    setBusy(false);
    if (r.status === 'found') {
      setScanning(false);
      setPendingProduct({ draft: productToDraft(r.product), from: 'off' });
      router.replace('/kitchen/product?from=scan');
      return;
    }
    if (r.status === 'not-found') {
      setScanning(false);
      setPendingProduct({ draft: { name: '', barcode: r.barcode, source: 'barcode', category: 'packaged' }, from: 'not-found' });
      router.replace('/kitchen/product?from=scan');
      return;
    }
    setError(r.message);
    locked.current = false;
  }, []);

  const start = async () => {
    setError(null);
    const p = perm?.granted ? perm : await requestPerm();
    if (p.granted) {
      locked.current = false;
      setScanning(true);
    } else setError(p.canAskAgain ? 'Bloom needs the camera to scan barcodes. You can also type the number below.' : 'Camera access is off for Bloom. You can turn it on in Android settings, or type the number below.');
  };

  const onScanned = (r: BarcodeScanningResult) => {
    const code = (r.data ?? '').trim();
    if (isValidBarcode(code)) handle(code);
  };

  return (
    <Screen>
      <BackHeader title="Scan a product" subtitle="Looks it up on Open Food Facts" />
      <DemoBanner />
      {scanning ? (
        <View style={{ borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000', height: 340 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={busy ? undefined : onScanned}
            accessibilityLabel="Camera viewfinder. Point it at the barcode on the packet."
          />
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', left: '12%', right: '12%', top: '35%', height: '30%', borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 16, borderStyle: 'dashed' }}
          />
          {busy ? (
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: space.sm, backgroundColor: c.surface, flexDirection: 'row', gap: space.xs, alignItems: 'center' }}>
              <ActivityIndicator color={c.ink} />
              <Text accessibilityLiveRegion="polite">Looking it up…</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Card tint={f.foodSoft}>
          <CardHeader icon={ScanBarcode} label="Barcode scan" accent={f.foodStrong} soft={c.surface} />
          <Text>Point your camera at the barcode on a packet. Bloom looks it up on Open Food Facts (a free, open food database) and shows a friendly health check.</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
            Only the barcode number is sent. The camera is used only while this screen is open.
          </Text>
          <Button label={perm?.granted ? 'Start scanning' : 'Allow camera & scan'} icon={Camera} onPress={start} style={{ marginTop: space.md }} />
          {perm && !perm.granted && !perm.canAskAgain ? (
            <Button label="Open Android settings" variant="ghost" onPress={() => Linking.openSettings().catch(() => {})} style={{ marginTop: space.xs }} />
          ) : null}
        </Card>
      )}
      {scanning ? <Button label="Stop camera" variant="secondary" onPress={() => setScanning(false)} /> : null}
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Card>
        <CardHeader icon={Keyboard} label="Type the barcode" accent={c.muted} soft={c.surfaceAlt} />
        <Field label="Barcode number" error={typedError} hint="The 8–13 digits under the bars.">
          <Input
            value={typed}
            onChangeText={(t) => {
              setTyped(t.replace(/[^0-9]/g, ''));
              setTypedError(null);
            }}
            keyboardType="number-pad"
            maxLength={14}
            error={!!typedError}
            accessibilityLabel="Barcode number"
          />
        </Field>
        <Button
          label="Look up"
          variant="secondary"
          loading={busy && !scanning}
          onPress={() => {
            if (!isValidBarcode(typed)) {
              setTypedError('Enter 8, 12 or 13 digits.');
              return;
            }
            locked.current = false;
            handle(typed);
          }}
          style={{ marginTop: space.sm }}
        />
      </Card>
      <Button label="Add a product by hand" variant="ghost" icon={PackageOpen} onPress={() => router.replace('/kitchen/product')} />
    </Screen>
  );
}
