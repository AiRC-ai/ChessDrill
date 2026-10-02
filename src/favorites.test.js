import { expect, it } from 'vitest';
import { filterFavoriteOpenings } from './favorites.js';

const openings=[
  {id:'ruy',name:'Ruy Lopez',lines:[{id:'closed',name:'Closed'},{id:'berlin',name:'Berlin'}]},
  {id:'italian',name:'Italian Game',lines:[{id:'giuoco',name:'Giuoco Piano'}]},
];

it('shows every line of a favorite opening and only starred lines from other families', () => {
  const result=filterFavoriteOpenings(openings,new Set(['ruy']),new Set(['giuoco']));
  expect(result.map(o=>[o.id,...o.lines.map(l=>l.id)])).toEqual([
    ['ruy','closed','berlin'],['italian','giuoco'],
  ]);
  expect(result[0]).toBe(openings[0]);
  expect(openings[1].lines).toHaveLength(1);
});

it('does not treat practice selection as a favorite', () => {
  expect(filterFavoriteOpenings(openings,new Set(),new Set(['closed'])).map(o=>[o.id,...o.lines.map(l=>l.id)])).toEqual([['ruy','closed']]);
  expect(filterFavoriteOpenings(openings,new Set(),new Set())).toEqual([]);
});
