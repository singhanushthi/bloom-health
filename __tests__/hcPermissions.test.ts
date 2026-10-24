/**
 * Every Health Connect permission Bloom asks for must be declared in app.json. If even one isn't,
 * Health Connect rejects the whole request without showing a screen ("can't connect").
 */
import appJson from '../app.json';
import { androidPermissionFor, readPermissionRequest } from '../src/health/client';
import { SHARING_TOGGLES, toLibraryPermission } from '../src/settings/healthSharing';

const declared = new Set<string>(appJson.expo.android.permissions);

describe('Health Connect permissions match app.json', () => {
  it('maps library permissions to manifest names', () => {
    expect(androidPermissionFor({ accessType: 'read', recordType: 'Steps' })).toBe('android.permission.health.READ_STEPS');
    expect(androidPermissionFor({ accessType: 'read', recordType: 'MenstruationFlow' })).toBe('android.permission.health.READ_MENSTRUATION');
    expect(androidPermissionFor({ accessType: 'write', recordType: 'ExerciseSession' })).toBe('android.permission.health.WRITE_EXERCISE');
    expect(androidPermissionFor({ accessType: 'read', recordType: 'ReadHealthDataHistory' })).toBe(
      'android.permission.health.READ_HEALTH_DATA_HISTORY'
    );
  });

  it.each(readPermissionRequest().map((p) => [`${p.accessType}:${p.recordType}`, p]))('connect request: %s is declared', (_n, p) => {
    const name = androidPermissionFor(p as { accessType: 'read'; recordType: string });
    expect(name).not.toBeNull();
    expect(declared.has(name!)).toBe(true);
  });

  it.each(SHARING_TOGGLES.map((t) => [t.perm]))('sharing toggle: %s is declared', (perm) => {
    const name = androidPermissionFor(toLibraryPermission(perm));
    expect(name).not.toBeNull();
    expect(declared.has(name!)).toBe(true);
  });

  it('never asks for nutrition READ (removed in 1.1)', () => {
    const all = [...readPermissionRequest(), ...SHARING_TOGGLES.map((t) => toLibraryPermission(t.perm))];
    expect(all.some((p) => p.recordType === 'Nutrition' && p.accessType === 'read')).toBe(false);
    expect(declared.has('android.permission.health.READ_NUTRITION')).toBe(false);
  });
});
