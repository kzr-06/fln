import { MAX_FLN_LEVEL } from '../data/skillProgressionMap';

export function getLevelProgressPercentage(currentLevel: number): number {
  return Math.min(100, Math.max(0, (currentLevel / MAX_FLN_LEVEL) * 100));
}

export function getNextFLNLevel(level: number): number {
  return Math.min(MAX_FLN_LEVEL, Math.max(1, level + 1));
}