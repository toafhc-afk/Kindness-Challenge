import { useState, useEffect } from 'react';
import { AppState, Track } from '../types';

const STORAGE_KEY = 'tzuchi_state';

const defaultState: AppState = {
  hasSeenPreview: false,
  track: null,
  level: 1,
  exp: 0,
  streak: 0,
  checkInCount: 0,
  co2Saved: 0,
  unlockedBadges: ['novice'],
  badgeUnlockDates: {},
  claimedRewards: [],
  lastCheckInDate: null,
  hasCompletedTutorial: false,
};

export function useGameState() {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return defaultState;
      }
    }
    return defaultState;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const updateState = (updates: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const setTrack = (track: Track) => {
    updateState({ track, level: 1 });
  };

  const addExp = (amount: number) => {
    updateState({ exp: state.exp + amount });
  };

  const resetState = () => {
    setState(defaultState);
    localStorage.removeItem(STORAGE_KEY);
  };

  return { state, updateState, setTrack, addExp, resetState };
}
