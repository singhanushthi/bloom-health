import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { SessionPlayer } from '../../../yoga/SessionPlayer';

export default function YogaSessionScreen() {
  const p = useLocalSearchParams<{ id: string; program?: string; day?: string; ready?: string }>();
  const day = p.day !== undefined && p.day !== '' ? Number(p.day) : undefined;
  return (
    <SessionPlayer
      sessionId={String(p.id ?? '')}
      programId={p.program || undefined}
      programDay={day !== undefined && Number.isFinite(day) ? day : undefined}
      skipIntro={p.ready === '1'}
    />
  );
}
