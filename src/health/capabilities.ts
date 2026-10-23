/**
 * What can count steps on this phone, decided from JS.
 *
 * Health Connect only counts steps natively from the phone's sensor on Android 14+
 * (API 34) with Health Connect SDK extension ≥ 20. React Native exposes the API level
 * (Platform.Version) but NOT the SDK-extension version (that needs
 * android.os.ext.SdkExtensions on the native side, which no installed library exposes).
 * So:
 *   - API < 34  → Health Connect cannot count phone steps; only other apps' data.
 *   - API ≥ 34  → "likely": Bloom asks for READ_STEPS and shows "No steps yet — counting
 *                 starts after you allow access" until data appears.
 */
import { Platform } from 'react-native';

export const PHONE_STEPS_MIN_API = 34;

export type PhoneStepSupport = 'likely' | 'no' | 'not-android';

export function phoneStepsInHealthConnect(): PhoneStepSupport {
  if (Platform.OS !== 'android') return 'not-android';
  const v = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  return v >= PHONE_STEPS_MIN_API ? 'likely' : 'no';
}

export function androidApiLevel(): number | null {
  if (Platform.OS !== 'android') return null;
  return typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
}
