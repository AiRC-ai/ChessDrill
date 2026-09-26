import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildPositionIndex, duePositionKeys, linesToPgn, parsePgnCollection, positionKey, positionOptions, updatePositionStat } from './learning.js';
import { parseMove } from './drill.js';

const lines = [
  { id:'a', name:'A', openingName:'Test', moves:['Nf3','d5','g3','Nf6'] },
  { id:'b', name:'B', openingName:'Test', moves:['g3','d5','Nf3','Nf6'] },
];

describe('position-aware learning', () => {
  it('recognizes transpositions reached by different move orders', () => {
    const index = buildPositionIndex(lines);
    const chess = new Chess();
    ['Nf3','d5','g3'].forEach(move => chess.move(move));
    expect([...positionOptions(index, chess.fen(), new Set(['a','b'])).keys()]).toContain('Nf6');
    expect(index.get(positionKey(chess.fen())).lineIds.size).toBe(2);
  });

  it('schedules misses immediately and grows intervals for clean recalls', () => {
    const now = 1_000_000;
    const missed = updatePositionStat({}, { correct:false, responseMs:4000 }, now);
    expect(missed.dueAt).toBe(now);
    const first = updatePositionStat(missed, { correct:true, responseMs:2000 }, now);
    const second = updatePositionStat(first, { correct:true, responseMs:1500 }, now);
    expect(first.intervalDays).toBe(1);
    expect(second.intervalDays).toBe(3);
    expect(duePositionKeys({ x:second }, ['x'], now)).toEqual([]);
  });

  it('round-trips exported PGN into custom lines', () => {
    const source=[{id:'x',name:'Imported test',openingName:'Italian Game',repertoireColor:'white',moves:['e4','e5','Nf3','Nc6','Bc4']}];
    const imported=parsePgnCollection(linesToPgn(source));
    expect(imported).toHaveLength(1);
    expect(imported[0].moves).toEqual(source[0].moves);
  });
});

describe('special move parsing', () => {
  it('supports castling', () => {
    const chess=new Chess();['e4','e5','Nf3','Nc6','Bc4','Nf6'].forEach(m=>chess.move(m));
    expect(parseMove(chess,'e1','g1')?.san).toBe('O-O');
  });

  it('supports en passant', () => {
    const chess=new Chess();['e4','a6','e5','d5'].forEach(m=>chess.move(m));
    expect(parseMove(chess,'e5','d6')?.flags).toContain('e');
  });

  it('uses the requested promotion piece', () => {
    const chess=new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1');
    expect(parseMove(chess,'a7','a8','n')?.promotion).toBe('n');
  });
});
