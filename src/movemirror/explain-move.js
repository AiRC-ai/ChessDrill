import { Chess } from 'chess.js';

const PIECES = {p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function moveUci(chess, uci) {
  if (!UCI.test(uci || '')) return null;
  try {
    return chess.move({
      from:uci.slice(0,2), to:uci.slice(2,4),
      ...(uci.length > 4 ? {promotion:uci[4]} : {}),
    });
  } catch { return null; }
}

function moveSan(chess, san) {
  try { return chess.move(san); } catch { return null; }
}

/** Keep only a legal continuation that begins with the engine's chosen move. */
export function solutionLine(fen, bestMove, candidate = []) {
  try {
    const chess = new Chess(fen);
    const first = moveUci(chess, bestMove);
    if (!first) return [];
    const line = [first.san];
    if (!Array.isArray(candidate) || candidate[0] !== first.san) return line;
    for (const san of candidate.slice(1,6)) {
      if (typeof san !== 'string' || san.length > 20) break;
      const move = moveSan(chess, san);
      if (!move) break;
      line.push(move.san);
    }
    return line;
  } catch { return []; }
}

export function solutionPosition(fen, line, step) {
  try {
    const chess = new Chess(fen);
    let lastMove = null;
    for (const san of line.slice(0, Math.max(0, Math.min(line.length, step)))) {
      const move = moveSan(chess, san);
      if (!move) break;
      lastMove = `${move.from}${move.to}`;
    }
    return {fen:chess.fen(),lastMove};
  } catch { return {fen,lastMove:null}; }
}

export function explainBestMove({
  fen, bestMove, bestLine = [], playedSan = '', punishmentMove = '',
  punishmentSan = '', mateThreat = false, loss = 0, reason = '',
}) {
  const line = solutionLine(fen,bestMove,bestLine);
  if (!line.length) return {headline:'Review the engine choice',why:'The saved move could not be replayed from this position.',contrast:'',line:[]};
  const before = new Chess(fen);
  const best = moveUci(before,bestMove);
  const points = [];
  let headline = `Why ${best.san}?`;
  if (before.isCheckmate()) {
    headline = 'It finishes with checkmate';
    points.push(`${best.san} checkmates the opposing king.`);
  } else {
    if (before.isCheck()) {
      headline = 'It makes the opponent answer a check';
      points.push(`${best.san} gives check, so the opponent must respond to the king threat.`);
    }
    if (best.captured) {
      if (!before.isCheck()) headline = `It captures on ${best.to}`;
      points.push(`It captures a ${PIECES[best.captured]} on ${best.to}.`);
    }
    if (best.promotion) points.push(`The pawn promotes to a ${PIECES[best.promotion]}.`);
    if (best.isKingsideCastle() || best.isQueensideCastle()) points.push('It castles, moving the king away from the center and connecting a rook.');
    if (best.piece === 'p' && ['d4','e4','d5','e5'].includes(best.to)) points.push(`The pawn claims the central square ${best.to}.`);
  }

  let contrast = '';
  try {
    const original = new Chess(fen);
    const played = moveSan(original,playedSan);
    let reply = played && (moveUci(original,punishmentMove) || moveSan(original,punishmentSan));
    if (played && !reply && mateThreat) {
      const matingMove = original.moves({verbose:true}).find(move => {
        original.move(move);
        const mate = original.isCheckmate();
        original.undo();
        return mate;
      });
      if (matingMove) reply = original.move(matingMove);
    }
    if (played && reply) {
      if (original.isCheckmate()) {
        contrast = `After your ${played.san}, ${reply.san} was checkmate.`;
        const sameReply = moveUci(before,`${reply.from}${reply.to}${reply.promotion||''}`);
        if (!sameReply) {
          contrast += ` After ${best.san}, that reply is no longer legal.`;
          points.push(`${best.san} prevents the immediate ${reply.san} tactic.`);
          headline = 'It avoids the mating reply';
        } else if (!before.isCheckmate()) {
          const defense = before.moves()[0];
          contrast += ` After ${best.san}, ${sameReply.san} can be met by ${defense}.`;
          points.push(`${best.san} leaves ${defense} available to answer ${sameReply.san}.`);
          headline = 'It avoids the mating reply';
        }
      } else if (reply.captured) {
        contrast = `After your ${played.san}, the opponent could play ${reply.san} and capture a ${PIECES[reply.captured]}.`;
      } else if (original.isCheck()) {
        contrast = `After your ${played.san}, the opponent could answer with the check ${reply.san}.`;
      }
    }
  } catch { /* Older saved cards may lack the original move or reply. */ }
  if (!contrast && mateThreat) {
    contrast = `Your played move allowed a forced mate in this search. ${best.san} avoids that line at the reviewed depth.`;
    headline = 'It avoids a mating line';
  } else if (!contrast && reason) contrast = reason;
  if (!contrast && playedSan && Number.isFinite(loss) && loss >= 60) {
    contrast = `Compared with ${playedSan}, the engine estimated this move preserves about ${(loss/100).toFixed(1)} pawns of evaluation at the reviewed depth.`;
  }

  if (!points.length) {
    points.push(`${best.san} moves the ${PIECES[best.piece]} to ${best.to}. The engine prefers the resulting position to the one after ${playedSan || 'the game move'} at this search depth.`);
  }
  if (line.length >= 3) {
    const sample = new Chess(fen);
    moveSan(sample,line[0]);
    moveSan(sample,line[1]);
    const follow = moveSan(sample,line[2]);
    if (follow?.captured) points.push(`In the sample continuation, ${line[1]} is met by ${line[2]}, capturing a ${PIECES[follow.captured]}.`);
    else if (follow && sample.isCheck()) points.push(`In the sample continuation, ${line[1]} is met by the check ${line[2]}.`);
  }
  return {headline,why:points.join(' '),contrast,line};
}
