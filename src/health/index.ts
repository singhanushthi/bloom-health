/**
 * Bloom data layer — the only module screens import for health data.
 *
 * Each metric lives in its own file and switches between Health Connect (live) and
 * src/data/mock.ts (demo) based on ReadContext.mode.
 */
export * from './types';
export * from './context';
export { getActivityToday } from './activity';
export { getLastNightSleep } from './sleep';
export { getHeartToday } from './heart';
export { getLatestSpo2 } from './spo2';
export { getCycleStatus, type CycleResult } from './cycle';
export { getTrends, type TrendRange } from './trends';
export { getSources, appName, METRIC_LABEL } from './sources';
export {
  getAvailability,
  getGrantedReadTypes,
  requestReadPermissions,
  openHealthConnectSettings,
  openHealthConnectInPlayStore,
  READ_RECORD_TYPES,
  type HcAvailability,
} from './client';
export { PHASE_LABEL, type CyclePhase } from './cyclePrediction';
