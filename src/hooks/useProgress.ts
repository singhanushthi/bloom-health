import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { motion } from '../theme/tokens';
import { useReducedMotion } from './useReducedMotion';

/**
 * Returns a 0→1 progress value that animates over `duration` (150–300ms) whenever `key`
 * changes. With reduced motion enabled it jumps straight to 1.
 */
export function useProgress(key: unknown, duration: number = motion.slow): number {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(0)).current;
  const [p, setP] = useState(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      setP(1);
      return;
    }
    anim.setValue(0);
    const id = anim.addListener(({ value }) => setP(value));
    Animated.timing(anim, {
      toValue: 1,
      duration: Math.min(300, Math.max(150, duration)),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [key, reduced, duration, anim]);

  return p;
}
