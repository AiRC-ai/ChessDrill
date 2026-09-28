import { expect, it } from 'vitest';
import { validateBackup } from './backup.js';

const parse = data => validateBackup(data,new Set(['italian-main']),['italian'],['lesson-1']);

it('rejects illegal imported lines before they reach the live repertoire', () => {
  expect(() => parse({version:2,customLines:[{id:'custom-one',name:'Broken',openingName:'Test',moves:['e4','e5','Qa8']}]})).toThrow('illegal move');
});

it('sanitizes imported IDs, roles, and progress while preserving legal custom lines', () => {
  const result = parse({version:2,selected:['italian-main','unknown','custom-one'],expanded:['italian','unknown'],lineRoles:{'custom-one':'black',unknown:'both'},stats:{'italian-main':{attempts:'<script>'}},customLines:[{id:'custom-one',name:'My line',openingName:'Open',moves:['e4','e5']}],lessonCompleted:{'lesson-1':10,unknown:99}});
  expect(result.selected).toEqual(['italian-main','custom-one']);
  expect(result.lineRoles['unknown']).toBeUndefined();
  expect(result.stats['italian-main'].attempts).toBe(0);
  expect(result.customLines[0].moves).toEqual(['e4','e5']);
  expect(Object.keys(result.lessonCompleted)).toEqual(['lesson-1']);
});
