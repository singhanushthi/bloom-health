/**
 * Export everything Bloom stored as JSON and hand it to the Android share sheet
 * (expo-file-system File API + expo-sharing, both SDK 58).
 */
import { exportAll } from './repos';

export async function exportAndShare(): Promise<'shared' | 'unavailable'> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FS = require('expo-file-system') as typeof import('expo-file-system');
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const data = await exportAll();
  const stamp = data.exportedAt.slice(0, 10);
  const file = new FS.File(FS.Paths.cache, `bloom-export-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.writeSync(JSON.stringify(data, null, 2));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Bloom data',
    UTI: 'public.json',
  });
  return 'shared';
}
