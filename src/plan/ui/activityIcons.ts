import {
  Bike,
  Dumbbell,
  Flower2,
  Footprints,
  House,
  Music,
  PersonStanding,
  Sparkles,
  TrendingUp,
  Trophy,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import type { ActivityType } from '../met';

export const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  walk: Footprints,
  run: PersonStanding,
  cycling: Bike,
  gym: Dumbbell,
  yoga: Flower2,
  dance: Music,
  swimming: Waves,
  sports: Trophy,
  housework: House,
  stairs: TrendingUp,
  hiit: Zap,
  other: Sparkles,
};
