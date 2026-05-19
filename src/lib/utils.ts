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
