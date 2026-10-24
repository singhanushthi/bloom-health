import React from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/** Height of the bottom tab bar without the safe-area inset (see src/app/(tabs)/_layout.tsx). */
export const TAB_BAR_HEIGHT = 64;

export function Screen({
  children,
  refreshing,
  onRefresh,
  contentStyle,
  scroll = true,
  tabBar = false,
  avoidKeyboard = false,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  /**
   * Screen sits inside the tab navigator: reserve tab bar height + safe area at the bottom so
   * the last card can never end up under a (possibly floating) tab bar.
   */
  tabBar?: boolean;
  /** Wrap in a KeyboardAvoidingView (screens with text fields near the bottom). */
  avoidKeyboard?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = {
    paddingTop: insets.top + space.md,
    paddingHorizontal: space.md,
    paddingBottom: tabBar ? TAB_BAR_HEIGHT + insets.bottom + space.lg : space.xl,
    gap: space.md,
  };
  if (!scroll) {
    return <View style={[{ flex: 1, backgroundColor: c.bg }, pad, contentStyle]}>{children}</View>;
  }
  const scrollView = (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[pad, contentStyle]}
      // A tap on a button while the keyboard is open must press the button, not just close the keyboard.
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={c.ink}
            colors={[c.cycle]}
            progressBackgroundColor={c.surface}
            accessibilityLabel="Pull to refresh"
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
  if (!avoidKeyboard) return scrollView;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      {scrollView}
    </KeyboardAvoidingView>
  );
}
