/**
 * "Export as JSON" and "Delete all my data" across every module that stores something:
 * the core tables (src/db/repos — periods, day logs, sleep, vitals, steps, plan, and the kv
 * table that also holds the plan profile/settings and the remembered watch), plus the tables
 * the feature modules create lazily (cycle, kitchen, yoga).
 *
 * Kept separate from repos.ts because the feature stores import repos (avoids an import cycle).
 */
import { deleteCycleData, exportCycleExtras } from '../cycle/store';
import { clearKitchenData, exportKitchenData } from '../kitchen/pantry';
import { cancelCycleReminders } from '../notify/scheduler';
import { loadPlanSettings } from '../plan/store';
import { getWatchState, forget as forgetConnectedWatch } from '../watch/controller';
import { loadRememberedWatch, WATCH_KV } from '../watch/storage';
import { clearYogaData, exportYogaData } from '../yoga/store';
import { deleteAllData, exportAll, kv, type BloomExport } from './repos';

export type FullExport = BloomExport & {
  planSettings: Awaited<ReturnType<typeof loadPlanSettings>>;
  cycle: Awaited<ReturnType<typeof exportCycleExtras>>;
  kitchen: Awaited<ReturnType<typeof exportKitchenData>>;
  yoga: Awaited<ReturnType<typeof exportYogaData>>;
  watch: { device: Awaited<ReturnType<typeof loadRememberedWatch>> };
};

export async function exportEverything(): Promise<FullExport> {
  const base = await exportAll();
  const [planSettings, cycle, kitchen, yoga, device] = await Promise.all([
    loadPlanSettings(),
    exportCycleExtras(),
    exportKitchenData(),
    exportYogaData(),
    loadRememberedWatch(),
  ]);
  return { ...base, planSettings, cycle, kitchen, yoga, watch: { device } };
}

/** Deletes everything Bloom saved on this phone. Health Connect and other apps are untouched. */
export async function deleteEverything(): Promise<void> {
  // Stop a live watch connection first so it can't write a reading after the wipe.
  if (getWatchState().remembered) {
    try {
      await forgetConnectedWatch();
    } catch {
      // the kv wipe below removes the stored watch anyway
    }
  }
  await deleteAllData();
  await deleteCycleData();
  await clearKitchenData();
  await clearYogaData();
  // Belt and braces: these live in kv (already wiped above).
  await kv.remove(WATCH_KV.device);
  await kv.remove(WATCH_KV.lastSaved);
  try {
    await cancelCycleReminders();
  } catch {
    // notifications module unavailable — nothing scheduled
  }
}
