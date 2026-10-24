import { Tabs } from 'expo-router/js-tabs';
import { CalendarHeart, ChartLine, Flower2, Sun, Target } from 'lucide-react-native';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/** Bottom tabs (max 5): Today · Plan · Yoga · Cycle · Trends. Settings opens from the gear on Today. */
export default function TabsLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.bg },
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.line,
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(8, insets.bottom),
        },
        tabBarItemStyle: { minHeight: 48 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarAccessibilityLabel: 'Today, dashboard',
          tabBarIcon: ({ color, focused }) => <Sun size={24} color={color as string} strokeWidth={focused ? 2.4 : 1.8} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarAccessibilityLabel: 'Plan, weight, food and activity',
          tabBarIcon: ({ color, focused }) => <Target size={24} color={color as string} strokeWidth={focused ? 2.4 : 1.8} />,
        }}
      />
      <Tabs.Screen
        name="yoga"
        options={{
          title: 'Yoga',
          tabBarAccessibilityLabel: 'Yoga sessions',
          tabBarIcon: ({ color, focused }) => <Flower2 size={24} color={color as string} strokeWidth={focused ? 2.4 : 1.8} />,
        }}
      />
      <Tabs.Screen
        name="cycle"
        options={{
          title: 'Cycle',
          tabBarAccessibilityLabel: 'Cycle calendar',
          tabBarIcon: ({ color, focused }) => (
            <CalendarHeart size={24} color={color as string} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          title: 'Trends',
          tabBarAccessibilityLabel: 'Trends, charts for 7 and 30 days',
          tabBarIcon: ({ color, focused }) => <ChartLine size={24} color={color as string} strokeWidth={focused ? 2.4 : 1.8} />,
        }}
      />
      {/* Still a route (/settings) — opened from the gear button on Today, hidden from the tab bar. */}
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
    </Tabs>
  );
}
