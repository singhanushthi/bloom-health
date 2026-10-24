/**
 * The Settings hub, as data: every section, its group, one-line description and route.
 * Each existing setting lives in exactly one of these pages (see the inventory in
 * src/app/settings/index.tsx).
 */
import type { LucideIcon } from 'lucide-react-native';
import { CalendarHeart, Footprints, Info, Plug, ShieldCheck, Sparkles, UserRound, HeartPulse } from 'lucide-react-native';
import type { ColorTokens } from '../theme/tokens';

export type SectionId = 'profile' | 'connect' | 'ai' | 'cycle' | 'steps' | 'health-connect' | 'data' | 'about';

export interface SettingsSection {
  id: SectionId;
  title: string;
  body: string;
  route: string;
  icon: LucideIcon;
  /** Token names for the icon badge (graphics only). */
  accent: keyof ColorTokens;
  soft: keyof ColorTokens;
}

export interface SettingsGroupDef {
  title: string;
  sections: SettingsSection[];
}

export const SETTINGS_GROUPS: SettingsGroupDef[] = [
  {
    title: 'You',
    sections: [
      {
        id: 'profile',
        title: 'You & your goals',
        body: 'Your goal, and what Today shows',
        route: '/settings/profile',
        icon: UserRound,
        accent: 'cycle',
        soft: 'cycleSoft',
      },
    ],
  },
  {
    title: 'Connections',
    sections: [
      {
        id: 'connect',
        title: 'Connect apps & watch',
        body: 'Noise watch, Flo, Google Fit and more',
        route: '/connect',
        icon: Plug,
        accent: 'spo2',
        soft: 'spo2Soft',
      },
      {
        id: 'ai',
        title: 'AI Coach',
        body: 'Ask questions about your data',
        route: '/settings/ai',
        icon: Sparkles,
        accent: 'sleep',
        soft: 'sleepSoft',
      },
      {
        id: 'health-connect',
        title: 'Health Connect sharing',
        body: 'What Bloom reads and saves',
        route: '/settings/health-connect',
        icon: HeartPulse,
        accent: 'heart',
        soft: 'heartSoft',
      },
    ],
  },
  {
    title: 'Health',
    sections: [
      {
        id: 'cycle',
        title: 'Period & reminders',
        body: 'Cycle length, goal, reminders, privacy',
        route: '/settings/cycle',
        icon: CalendarHeart,
        accent: 'cycle',
        soft: 'cycleSoft',
      },
      {
        id: 'steps',
        title: 'Steps & phone sensors',
        body: 'Step goal, stride, step counting',
        route: '/settings/steps',
        icon: Footprints,
        accent: 'steps',
        soft: 'stepsSoft',
      },
    ],
  },
  {
    title: 'Privacy & app',
    sections: [
      {
        id: 'data',
        title: 'Data & privacy',
        body: 'Export, delete, demo mode',
        route: '/settings/data',
        icon: ShieldCheck,
        accent: 'spo2',
        soft: 'spo2Soft',
      },
      {
        id: 'about',
        title: 'About Bloom',
        body: 'Version, what’s new, safety',
        route: '/settings/about',
        icon: Info,
        accent: 'sleep',
        soft: 'sleepSoft',
      },
    ],
  },
];

export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap((g) => g.sections);
