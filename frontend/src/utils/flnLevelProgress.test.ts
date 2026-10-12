import { describe, expect, it } from 'vitest';
import { MAX_FLN_LEVEL } from '../data/skillProgressionMap';
import {
  getLevelProgressPercentage,
  getNextFLNLevel,
} from './flnLevelProgress';

describe('FLN level progress', () => {
  it('uses the actual maximum of 109 curriculum levels', () => {
    expect(MAX_FLN_LEVEL).toBe(109);
  });

  it('calculates progress correctly at Level 100 without reaching 100%', () => {
    expect(getLevelProgressPercentage(100)).toBeCloseTo((100 / 109) * 100);
    expect(getLevelProgressPercentage(100)).toBeLessThan(100);
  });

  it('reaches 100% at Level 109', () => {
    expect(getLevelProgressPercentage(109)).toBe(100);
  });

  it('recommends Level 101 when the current level is 100', () => {
    expect(getNextFLNLevel(100)).toBe(101);
  });

  it('does not recommend a level beyond 109', () => {
    expect(getNextFLNLevel(109)).toBe(109);
  });

  it('keeps progress percentages within 0% and 100%', () => {
    expect(getLevelProgressPercentage(-5)).toBe(0);
    expect(getLevelProgressPercentage(120)).toBe(100);
  });
});
