import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { explainBestMove, solutionLine, solutionPosition } from './explain-move.js';

describe('engine study explanation', () => {
  it('explains a saved mate avoidance with the actual mating reply', () => {
    const board = new Chess();
    board.move('f3');
    board.move('e5');
    const result = explainBestMove({
      fen:board.fen(),bestMove:'e2e3',playedSan:'g4',punishmentSan:'Qh4#',mateThreat:true,
    });
    expect(result.headline).toContain('mating reply');
    expect(result.contrast).toContain('Qh4# was checkmate');
    expect(result.contrast).toContain('Qh4+ can be met by g3');
    expect(result.why).toContain('g3 available');
    expect(result.line).toEqual(['e3']);
  });

  it('recovers the mating reply from an older card without stored analysis', () => {
    const board = new Chess();
    board.move('f3');
    board.move('e5');
    const result = explainBestMove({fen:board.fen(),bestMove:'e2e3',playedSan:'g4',mateThreat:true});
    expect(result.contrast).toContain('Qh4# was checkmate');
    expect(result.contrast).toContain('g3');
  });

  it('ties a capture and the opponent reply to a legal continuation', () => {
    const board = new Chess();
    board.move('e4');
    board.move('d5');
    const fen = board.fen();
    const result = explainBestMove({
      fen,bestMove:'e4d5',bestLine:['exd5','Qxd5','Nc3'],
      playedSan:'Nf3',punishmentSan:'dxe4',loss:180,
    });
    expect(result.why).toContain('captures a pawn on d5');
    expect(result.contrast).toContain('dxe4');
    expect(result.line).toEqual(['exd5','Qxd5','Nc3']);
    expect(solutionPosition(fen,result.line,3).fen).toBeTruthy();
    expect(solutionPosition(fen,result.line,3).lastMove).toBe('b1c3');
  });

  it('keeps old or mismatched stored lines from showing illegal moves', () => {
    const start = new Chess().fen();
    expect(solutionLine(start,'e2e4',['d4','e5'])).toEqual(['e4']);
    const result = explainBestMove({fen:start,bestMove:'e2e4',playedSan:'a3',loss:90});
    expect(result.why).toContain('central square e4');
    expect(result.contrast).toContain('reviewed depth');
  });
});
