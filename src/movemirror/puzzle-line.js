import { Chess } from 'chess.js';
import { solutionLine } from './explain-move.js';

const uci = move => `${move.from}${move.to}${move.promotion || ''}`;

// An engine PV is a sample continuation, not a puzzle by itself. Stop at the
// last concrete payoff (or answer to a forcing reply) within five user moves.
export function puzzlePlan(fen, bestMove, candidate) {
  const line = solutionLine(fen, bestMove, candidate);
  if (!line.length) return {line:[], challengeLine:[], moves:0};
  const chess = new Chess(fen);
  let payoff = 0;
  let opponentForced = false;
  for (let index = 0; index < Math.min(line.length, 9); index += 1) {
    const move = chess.move(line[index]);
    if (index % 2 === 0) {
      if (index && (move.captured || move.promotion || chess.isCheck() || chess.isCheckmate() || opponentForced)) payoff = index;
      opponentForced = false;
    } else {
      opponentForced = !!move.captured || chess.isCheck();
    }
    if (chess.isGameOver()) break;
  }
  const challengeLine = line.slice(0, payoff + 1);
  return {line, challengeLine, moves:(challengeLine.length + 1) / 2};
}

export function expectedPuzzleMove(chess, plan, step) {
  const san = plan.challengeLine[step];
  return san ? chess.moves({verbose:true}).find(move => move.san === san) || null : null;
}

// Applies one user move and the PV reply. The board always returns to the
// user's turn unless the idea is finished. Wrong attempts leave it untouched.
export function advancePuzzle(chess, plan, step, move) {
  const expected = expectedPuzzleMove(chess,plan,step);
  if (!expected || uci(expected) !== uci(move)) return {correct:false,step};
  const played = chess.move(expected.san);
  let reply = null;
  let nextStep = step + 1;
  if (nextStep < plan.challengeLine.length) {
    reply = chess.move(plan.challengeLine[nextStep]);
    nextStep++;
  }
  return {correct:true,solved:nextStep >= plan.challengeLine.length,step:nextStep,played,reply,
    lastMove:reply ? uci(reply) : uci(played)};
}
