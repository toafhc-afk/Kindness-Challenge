export type Track = 'veg' | 'plastic' | 'dual';

export interface Task {
  id: number;
  title: string;
  desc: string;
  fullDesc: string;
  icon: string;
  placeholder?: string;
  checklist?: string[];
}

export interface TrackData {
  themeColor: string;
  lightColor: string;
  bg: string;
  tasks: Task[];
}

export interface Badge {
  id: string;
  track: Track;
  level?: number;
  name: string;
  icon: string;
  largeIcon?: string;
  desc: string;
  condition: string;
  type: 'levelBadge' | 'completeBadge';
  reward?: string[];
}

export interface AppState {
  hasSeenPreview: boolean;
  track: Track | null;
  level: number; // Current active level (1-4)
  exp: number;
  streak: number;
  checkInCount: number;
  co2Saved: number;
  unlockedBadges: string[];
  badgeUnlockDates: Record<string, string>;
  claimedRewards: string[];
  lastCheckInDate: string | null;
  hasCompletedTutorial?: boolean;
  uid?: string;
  createdAt?: any;
  updatedAt?: any;
  customDisplayName?: string;
  customAvatarSeed?: string;
}

export type View = 'preview' | 'select' | 'dashboard' | 'map' | 'checkin' | 'feed' | 'profile' | 'admin' | 'notifications';
