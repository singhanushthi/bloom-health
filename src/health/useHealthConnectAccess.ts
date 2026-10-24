/**
 * The single Health Connect action used by the Connect hero and the wizards' "allow access" step:
 * Install / Update (Play Store) → Allow access (permission sheet) → Manage (Health Connect settings).
 * Any failure becomes an inline message with an "Open Health Connect settings" fallback.
 */
import { useCallback, useState } from 'react';
import { useAppState } from '../state/AppState';
import { openHealthConnectInPlayStore, openHealthConnectSettings, READ_RECORD_TYPES } from './client';
import { heroState, type HeroState } from './connectWizard';

export interface AccessProblem {
  title: string;
  body: string;
}

export function useHealthConnectAccess(): {
  state: HeroState;
  busy: boolean;
  problem: AccessProblem | null;
  run: () => Promise<void>;
  openSettings: () => void;
} {
  const app = useAppState();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<AccessProblem | null>(null);
  const state = heroState(app.availability, app.granted.size, READ_RECORD_TYPES.length);

  const run = useCallback(async () => {
    setProblem(null);
    if (state.kind === 'install' || state.kind === 'update') {
      try {
        await openHealthConnectInPlayStore();
      } catch {
        setProblem({ title: 'Couldn’t open the Play Store', body: 'Open the Play Store and search for “Health Connect”.' });
      }
      return;
    }
    if (state.kind === 'connected') {
      openHealthConnectSettings();
      return;
    }
    if (state.kind !== 'allow') return;
    setBusy(true);
    try {
      const granted = await app.requestPermissions();
      if (!granted.length) {
        setProblem({
          title: 'Nothing was allowed yet',
          body: 'If no Health Connect screen appeared, open Health Connect settings → App permissions → Bloom, and allow what you want.',
        });
      }
    } catch (e) {
      setProblem({
        title: 'Health Connect didn’t open',
        body: `${e instanceof Error && e.message ? `${e.message} ` : ''}You can allow Bloom in Health Connect settings → App permissions → Bloom.`,
      });
    } finally {
      setBusy(false);
    }
  }, [app, state.kind]);

  return { state, busy, problem, run, openSettings: openHealthConnectSettings };
}
