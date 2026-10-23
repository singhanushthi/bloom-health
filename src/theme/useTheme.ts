import { useColorScheme } from 'react-native';
import { colors, type Theme } from './tokens';

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, c: colors[scheme] };
}
