import React from 'react';
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export function Screen({
  children,
  refreshing,
  onRefresh,
  contentStyle,
  scroll = true,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = {
    paddingTop: insets.top + space.md,
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  };
  if (!scroll) {
    return <View style={[{ flex: 1, backgroundColor: c.bg }, pad, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[pad, contentStyle]}
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
}
