import { expect, it } from 'vitest';
import { validateBackup } from './backup.js';

const parse = data => validateBackup(data,new Set(['italian-main']),['italian'],['lesson-1']);

it('rejects illegal imported lines before they reach the live repertoire', () => {
  expect(() => parse({version:2,customLines:[{id:'custom-one',name:'Broken',openingName:'Test',moves:['e4','e5','Qa8']}]})).toThrow('illegal move');
});

it('sanitizes imported IDs, roles, and progress while preserving legal custom lines', () => {
  const result = parse({version:2,selected:['italian-main','unknown','custom-one'],expanded:['italian','unknown'],favoriteOpenings:['italian','custom-repertoire','unknown'],favoriteLines:['italian-main','custom-one','unknown'],focus:'favorites',lineRoles:{'custom-one':'black',unknown:'both'},stats:{'italian-main':{attempts:'<script>'}},customLines:[{id:'custom-one',name:'My line',openingName:'Open',moves:['e4','e5']}],lessonCompleted:{'lesson-1':10,unknown:99}});
  expect(result.selected).toEqual(['italian-main','custom-one']);
  expect(result.favoriteOpenings).toEqual(['italian','custom-repertoire']);
  expect(result.favoriteLines).toEqual(['italian-main','custom-one']);
  expect(result.focus).toBe('favorites');
  expect(result.lineRoles['unknown']).toBeUndefined();
  expect(result.stats['italian-main'].attempts).toBe(0);
  expect(result.customLines[0].moves).toEqual(['e4','e5']);
  expect(Object.keys(result.lessonCompleted)).toEqual(['lesson-1']);
});

it('keeps older backups without favorites usable and discards a missing custom favorite', () => {
  const older=parse({version:2,selected:['italian-main']});
  expect(older.favoriteOpenings).toEqual([]);
  expect(older.favoriteLines).toEqual([]);
  expect(parse({version:2,favoriteOpenings:['custom-repertoire']}).favoriteOpenings).toEqual([]);
});
