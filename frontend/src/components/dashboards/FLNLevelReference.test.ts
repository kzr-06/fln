import { describe, expect, it } from 'vitest';
import { FLN_LEVELS_LIST } from './FLNLevelReference';

describe('FLN Levels Framework Reference', () => {
  it('contains exactly 109 curriculum levels', () => {
    expect(FLN_LEVELS_LIST).toHaveLength(109);
  });

  it('contains every level ID from 1 through 109 exactly once', () => {
    const ids = FLN_LEVELS_LIST.map(level => level.id);

    expect(new Set(ids).size).toBe(109);
    expect(ids.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 109 }, (_, index) => index + 1),
    );
  });

  it('has complete reference details for levels 93 through 109', () => {
    const newLevels = FLN_LEVELS_LIST.filter(
      level => level.id >= 93 && level.id <= 109,
    );

    expect(newLevels).toHaveLength(17);

    for (const level of newLevels) {
      expect(level.name.trim()).not.toBe('');
      expect(level.class.trim()).not.toBe('');
      expect(level.strand.trim()).not.toBe('');
    }
  });
});
