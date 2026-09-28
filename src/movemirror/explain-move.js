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
  if (!line.length) return {headline:'Review the engine choice',principle:'Verify the position',why:'The saved move could not be replayed from this position.',contrast:'',question:'Which legal moves change the threats here?',line:[]};
  const before = new Chess(fen);
  const after = new Chess(fen);
  const best = moveUci(after,bestMove);
  const color = best.color, enemy = color === 'w' ? 'b' : 'w';
  const points = [];
  let principle = 'Improve the position';
  let question = 'Before moving, which checks, captures, and threats change after this move?';
  if (after.isCheckmate()) {
    principle = 'Checkmate';
    points.push(`${best.san} checkmates the opposing king; there is no legal reply.`);
  } else {
    if (after.isCheck()) {
      principle = 'Forcing move';
      question = 'After a check, what legal replies can the opponent play?';
      points.push(`${best.san} gives check, so the opponent must deal with the king before pursuing other plans.`);
    }
    if (best.captured) {
      points.push(`It captures a ${PIECES[best.captured]} on ${best.to}.`);
      if (principle === 'Improve the position') principle = 'Capture with purpose';
    }
    if (best.promotion) { principle = 'Pawn promotion'; points.push(`The pawn promotes to a ${PIECES[best.promotion]}.`); }
    if (best.isKingsideCastle() || best.isQueensideCastle()) {
      principle = 'King safety'; question = 'Can you improve king safety and bring a rook into play at the same time?';
      points.push('Castling moves the king off the central file and brings the rook toward the center.');
    }
    if (best.piece === 'p' && ['d4','e4','d5','e5'].includes(best.to)) {
      if (principle === 'Improve the position') principle = 'Central space';
      question = 'Can a pawn occupy or challenge a central square safely?';
      points.push(`The pawn occupies ${best.to}, a central square that influences development and space.`);
    }
    if (['n','b'].includes(best.piece) && best.from[1] === (color === 'w' ? '1' : '8')) {
      if (principle === 'Improve the position') principle = 'Development';
      question = 'Which undeveloped piece can enter the game with a threat?';
      points.push(`It develops the ${PIECES[best.piece]} from the back rank to ${best.to}.`);
    }
    const threatened = [];
    for (const row of after.board()) for (const item of row) {
      if (!item || item.color !== enemy || !['q','r','b','n'].includes(item.type)) continue;
      if (after.attackers(item.square,color).includes(best.to)) threatened.push(item);
    }
    if (threatened.length >= 2 && ['n','b','p','r','q'].includes(best.piece)) {
      principle = 'Double attack'; question = 'Which move attacks two valuable targets at once?';
      points.push(`From ${best.to}, the ${PIECES[best.piece]} attacks both the ${PIECES[threatened[0].type]} on ${threatened[0].square} and the ${PIECES[threatened[1].type]} on ${threatened[1].square}. The opponent must account for both threats.`);
    } else if (threatened.length && !best.captured) {
      if (principle === 'Improve the position') principle = 'Create a threat';
      points.push(`From ${best.to}, the ${PIECES[best.piece]} attacks the ${PIECES[threatened[0].type]} on ${threatened[0].square}.`);
    }
    if (before.attackers(best.from,enemy).length && !after.attackers(best.to,enemy).length && !best.captured) {
      if (principle === 'Improve the position') principle = 'Move out of danger';
      points.push(`The ${PIECES[best.piece]} was attacked on ${best.from}; ${best.to} is not currently attacked by an opposing piece.`);
    }
    if (best.piece === 'r' && !after.board().flat().some(item => item?.type === 'p' && item.square[0] === best.to[0])) {
      if (principle === 'Improve the position') principle = 'Open file';
      points.push(`The rook reaches the ${best.to[0]}-file, which has no pawns blocking it.`);
    }
    if (best.piece === 'p' && ['4','5','6','7'].includes(color === 'w' ? best.to[1] : String(9 - Number(best.to[1])))) {
      const file = 'abcdefgh'.indexOf(best.to[0]), rank = Number(best.to[1]);
      const blockers = after.board().flat().filter(item => item?.type === 'p' && item.color === enemy && Math.abs('abcdefgh'.indexOf(item.square[0])-file) <= 1 && (color === 'w' ? Number(item.square[1]) > rank : Number(item.square[1]) < rank));
      if (!blockers.length) {
        if (principle === 'Improve the position') principle = 'Passed pawn';
        question = 'Does the opponent have a pawn ahead on this file or a neighboring file?';
        points.push(`This pawn is passed: no opposing pawn ahead on its file or either neighboring file can stop its advance directly.`);
      }
    }
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
        const sameReply = moveUci(after,`${reply.from}${reply.to}${reply.promotion||''}`);
        if (!sameReply) {
          contrast += ` After ${best.san}, that reply is no longer legal.`;
          principle = 'Prevent checkmate';
        } else if (!after.isCheckmate()) {
          contrast += ` After ${best.san}, the same reply ${sameReply.san} does not checkmate.`;
          principle = 'Prevent checkmate';
          if (after.isCheck()) {
            const defense = after.moves({verbose:true})[0];
            if (defense) {
              contrast += ` A legal answer to the check is ${defense.san}.`;
              points.push(played.from === defense.from
                ? `${best.san} leaves the ${PIECES[defense.piece]} on ${defense.from}, so ${defense.san} can answer that check.`
                : `After the same checking reply, ${defense.san} is a legal way to answer it.`);
              question = 'What defensive move becomes possible if you keep this piece available?';
            }
          }
        } else {
          contrast += ` That same reply also checkmates after ${best.san}; check this shallow engine recommendation at a greater depth.`;
        }
      } else if (reply.captured) {
        contrast = `After your ${played.san}, the opponent could play ${reply.san} and capture a ${PIECES[reply.captured]}.`;
      } else if (original.isCheck()) {
        contrast = `After your ${played.san}, the opponent could answer with the check ${reply.san}.`;
      }
    }
  } catch { /* Older saved cards may lack the original move or reply. */ }
  if (!contrast && mateThreat) {
    contrast = `The engine found a mating line after ${playedSan || 'the game move'} at this search depth. Compare the opponent's checks after ${best.san}; a deeper search can change the verdict.`;
  } else if (!contrast && reason) contrast = reason;
  if (!contrast && playedSan && Number.isFinite(loss) && loss >= 60) {
    contrast = `Compared with ${playedSan}, the engine estimated this move preserves about ${(loss/100).toFixed(1)} pawns of evaluation at the reviewed depth.`;
  }

  if (!points.length) {
    points.push(`${best.san} puts the ${PIECES[best.piece]} on ${best.to}. Replay the suggested continuation to see which pieces and squares become more important; this position has no simple single-move motif.`);
  }
  if (line.length >= 3) {
    const sample = new Chess(fen);
    moveSan(sample,line[0]);
    moveSan(sample,line[1]);
    const follow = moveSan(sample,line[2]);
    if (follow?.captured) points.push(`In the sample continuation, ${line[1]} is met by ${line[2]}, capturing a ${PIECES[follow.captured]}.`);
    else if (follow && sample.isCheck()) points.push(`In the sample continuation, ${line[1]} is met by the check ${line[2]}.`);
  }
  const headline = principle === 'Prevent checkmate' ? 'It changes the mating threat' : `${principle}: ${best.san}`;
  return {headline,principle,why:points.join(' '),contrast,question,line};
}
