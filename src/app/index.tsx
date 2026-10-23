import { Redirect } from 'expo-router';
import React from 'react';
import { useAppState } from '../state/AppState';

/** Entry: first launch → onboarding, afterwards → Today. */
export default function Index() {
  const { onboarded } = useAppState();
  return <Redirect href={onboarded ? '/(tabs)' : '/onboarding'} />;
}
