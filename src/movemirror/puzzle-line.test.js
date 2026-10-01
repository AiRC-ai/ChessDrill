import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { advancePuzzle, expectedPuzzleMove, puzzlePlan } from './puzzle-line.js';
import { explainPuzzleIdea } from './explain-move.js';

describe('engine puzzle ideas', () => {
  it('follows a concrete five-move idea and checks each reply before completion', () => {
    const fen = new Chess().fen();
    const line = ['e4','e5','Nf3','Nc6','Bc4','Nf6','Ng5','d5','exd5'];
    const plan = puzzlePlan(fen,'e2e4',line);
    expect(plan.moves).toBe(5);
    expect(plan.challengeLine).toEqual(line);
    const board = new Chess(fen);
    let step = 0;
    for (let index = 0; index < 5; index++) {
      const expected = expectedPuzzleMove(board,plan,step);
      const wrong = board.moves({verbose:true}).find(move=>move.san!==expected.san);
      expect(advancePuzzle(board,plan,step,wrong).correct).toBe(false);
      const result = advancePuzzle(board,plan,step,expected);
      step = result.step;
      expect(result.solved).toBe(index === 4);
      if (index < 4) expect(board.turn()).toBe('w');
    }
    const explanation = explainPuzzleIdea({fen,bestMove:'e2e4',bestLine:line},plan.challengeLine);
    expect(explanation.idea).toContain('exd5 captures the pawn on d5');
    expect(explanation.idea).toContain('Ng5');
  });

  it('ends a quiet continuation after one move, but requires an answer to a checking reply', () => {
    const board = new Chess(); board.move('f3'); board.move('e5');
    const fen = board.fen();
    const defensive = puzzlePlan(fen,'e2e3',['e3','Qh4+','g3']);
    expect(defensive.moves).toBe(2);
    expect(explainPuzzleIdea({fen,bestMove:'e2e3',bestLine:defensive.line},defensive.challengeLine).idea).toContain('g3 answers the check');
    expect(puzzlePlan(new Chess().fen(),'e2e4',['e4','e5','Nf3','Nc6','Bc4']).moves).toBe(1);
  });
});
