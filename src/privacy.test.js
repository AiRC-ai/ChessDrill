import { describe, expect, it } from 'vitest';
import { deleteLocalStudyData, STUDY_STORAGE_KEYS } from './privacy.js';

describe('deleting local study data', () => {
  it('removes the current and legacy study stores while preserving unrelated data', () => {
    const values = new Map([...STUDY_STORAGE_KEYS.map(key => [key, 'saved']), ['unrelated', 'keep']]);
    deleteLocalStudyData({ removeItem: key => values.delete(key) });
    expect([...values]).toEqual([['unrelated', 'keep']]);
  });
});
