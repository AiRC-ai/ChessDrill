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
    expect(result.headline).toContain('mating threat');
    expect(result.contrast).toContain('Qh4# was checkmate');
    expect(result.contrast).toContain('legal answer to the check is g3');
    expect(result.why).toContain('leaves the pawn on g2');
    expect(result.line).toEqual(['e3']);
  });

  it('recovers the mating reply from an older card without stored analysis', () => {
    const board = new Chess();
    board.move('f3');
    board.move('e5');
    const result = explainBestMove({fen:board.fen(),bestMove:'e2e3',playedSan:'g4',mateThreat:true});
    expect(result.contrast).toContain('Qh4# was checkmate');
    expect(result.contrast).toContain('legal answer to the check is g3');
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
    expect(result.why).toContain('e4, a central square');
    expect(result.contrast).toContain('reviewed depth');
  });

  it('identifies a double attack from actual attacked squares', () => {
    const result = explainBestMove({fen:'q3r1k1/8/8/1N6/8/8/7K/8 w - - 0 1',bestMove:'b5c7'});
    expect(result.principle).toBe('Double attack');
    expect(result.why).toContain('queen on a8');
    expect(result.why).toContain('rook on e8');
    expect(result.question).toContain('two valuable targets');
  });

  it('does not invent a defense when the alleged best move still allows mate', () => {
    const board = new Chess(); board.move('f3'); board.move('e5');
    const result = explainBestMove({fen:board.fen(),bestMove:'g2g4',playedSan:'g4',punishmentSan:'Qh4#',mateThreat:true});
    expect(result.contrast).toContain('also checkmates');
    expect(result.contrast).not.toContain('legal answer');
  });
});
