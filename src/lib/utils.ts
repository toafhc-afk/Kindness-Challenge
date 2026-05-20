import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateLevel(exp: number, expReqs: number[]) {
  let currentLv = 1;
  for (let i = 0; i < expReqs.length; i++) {
    if (exp >= expReqs[i]) {
      currentLv = i + 1;
    }
  }
  return Math.min(currentLv, 5);
}

export function getLevelForTrack(track: string, unlockedBadges: string[]): number {
  if (unlockedBadges.includes(`${track}_complete`)) return 4;
  if (unlockedBadges.includes(`${track}_3`)) return 4;
  if (unlockedBadges.includes(`${track}_2`)) return 3;
  if (unlockedBadges.includes(`${track}_1`)) return 2;
  return 1;
}

