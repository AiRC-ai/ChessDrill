import { describe, expect, it } from 'vitest';
import { filterOpeningLines } from './opening-search.js';

const openings = [
  {id:'ruy',name:'Ruy Lopez',eco:'C60–C99',lines:[
    {id:'closed-berlin',name:'Berlin Defense, Closed Variation',eco:'C65'},
    {id:'closed',name:'Closed',eco:'C84'},
    {id:'berlin',name:'Berlin Defense',eco:'C65'},
    {id:'main',name:'Main line',eco:'C60'},
  ]},
  {id:'italian',name:'Italian Game',eco:'C50–C59',lines:[
    {id:'italian-main',name:'Main line',eco:'C50'},
  ]},
];

describe('opening search', () => {
  it('shows only matching lines under their opening, even with a combined search', () => {
    for (const query of ['closed','Ruy Lopez Closed','Ruy Lopez: Closed']) {
      const result=filterOpeningLines(openings,query);
      expect(result.map(o=>o.id)).toEqual(['ruy']);
      expect(result[0].lines.map(line=>line.id)).toEqual(['closed','closed-berlin']);
    }
  });

  it('matches a line ECO without showing sibling lines or unrelated openings', () => {
    expect(filterOpeningLines(openings,'C84').map(o=>o.lines.map(line=>line.id))).toEqual([['closed']]);
    expect(filterOpeningLines(openings,'C60').map(o=>o.lines.map(line=>line.id))).toEqual([['main']]);
    expect(filterOpeningLines(openings,'Closed C60')).toEqual([]);
    expect(filterOpeningLines(openings,'unknown')).toEqual([]);
  });

  it('shows all variations when the opening family itself matches', () => {
    expect(filterOpeningLines(openings,'Ruy Lopez')[0].lines).toEqual(openings[0].lines);
    expect(filterOpeningLines(openings,'')[0].lines).toEqual(openings[0].lines);
  });
});
