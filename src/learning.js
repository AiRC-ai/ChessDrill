import { Chess } from 'chess.js';

export function positionKey(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function buildPositionIndex(lines) {
  const index = new Map();
  for (const line of lines) {
    const chess = new Chess();
    for (let ply = 0; ply < line.moves.length; ply += 1) {
      const key = positionKey(chess.fen());
      if (!index.has(key)) index.set(key, { fen: chess.fen(), turn: chess.turn(), moves: new Map(), lineIds: new Set(), openings: new Set() });
      const node = index.get(key);
      const san = line.moves[ply];
      if (!node.moves.has(san)) node.moves.set(san, { san, lines: [], count: 0 });
      const branch = node.moves.get(san);
      branch.lines.push(line);
      branch.count += 1;
      node.lineIds.add(line.id);
      if (line.openingName) node.openings.add(line.openingName);
      const move = chess.move(san);
      if (!move) throw new Error(`Invalid move ${san} in ${line.name}`);
    }
  }
  return index;
}

export function positionOptions(index, fen, eligibleIds) {
  const node = index.get(positionKey(fen));
  const options = new Map();
  if (!node) return options;
  for (const [san, branch] of node.moves) {
    const lines = eligibleIds ? branch.lines.filter(line => eligibleIds.has(line.id)) : branch.lines;
    if (lines.length) options.set(san, lines);
  }
  return options;
}

export function updatePositionStat(previous = {}, result = {}, now = Date.now()) {
  const attempts = (previous.attempts || 0) + 1;
  const correct = (previous.correct || 0) + (result.correct ? 1 : 0);
  const streak = result.correct && !result.hinted ? (previous.streak || 0) + 1 : 0;
  const ease = Math.max(1.3, Math.min(2.8, (previous.ease || 2.2) + (result.correct ? (result.hinted ? -0.05 : 0.08) : -0.22)));
  const priorInterval = previous.intervalDays || 0;
  const intervalDays = result.correct
    ? Math.max(1, streak === 1 ? 1 : streak === 2 ? 3 : Math.round(Math.max(3, priorInterval) * ease))
    : 0;
  const responseMs = Math.max(0, Number(result.responseMs) || 0);
  const avgMs = responseMs ? Math.round(((previous.avgMs || responseMs) * (attempts - 1) + responseMs) / attempts) : (previous.avgMs || 0);
  return { attempts, correct, streak, ease, intervalDays, avgMs, hints:(previous.hints || 0)+(result.hinted ? 1 : 0), lapses:(previous.lapses || 0)+(result.correct ? 0 : 1), dueAt:now + intervalDays * 86400000, lastSeen:now };
}

export function duePositionKeys(stats, keys, now = Date.now()) {
  return [...keys].filter(key => !stats[key] || stats[key].dueAt <= now).sort((a, b) => (stats[a]?.dueAt || 0) - (stats[b]?.dueAt || 0));
}

export function dueReviewKeys(stats, keys, now = Date.now()) {
  return duePositionKeys(stats, keys, now).filter(key => (stats[key]?.attempts || 0) > 0);
}

export function positionMastery(stat) {
  if (!stat?.attempts) return 0;
  const accuracy = stat.correct / stat.attempts;
  const retention = Math.min(1, (stat.intervalDays || 0) / 14);
  return Math.round((accuracy * .7 + retention * .3) * 100);
}

export function coverageForLines(lines, index, positionStats, now = Date.now()) {
  const chosen = new Map(lines.map(line => [line.id,line]));
  const keys = [];
  for (const [key, node] of index) {
    const trainable = [...node.lineIds].some(id => {
      const line = chosen.get(id);
      return line && (positionStats[key]?.attempts || node.turn === (line.repertoireColor === 'black' ? 'b' : 'w'));
    });
    if (trainable) keys.push(key);
  }
  const practiced = keys.filter(key => positionStats[key]?.attempts).length;
  const due = dueReviewKeys(positionStats, keys, now).length;
  const mastery = keys.length ? Math.round(keys.reduce((sum, key) => sum + positionMastery(positionStats[key]), 0) / keys.length) : 0;
  return { positions:keys.length, practiced, due, mastery };
}

export function coverageByOpening(openings, selectedLines, index, positionStats, now = Date.now()) {
  const selectedById = new Map(selectedLines.map(line => [line.id,line]));
  return openings.map(o => ({o,lines:o.lines.map(line => selectedById.get(line.id)).filter(Boolean)}))
    .filter(item => item.lines.length)
    .map(item => ({...item,c:coverageForLines(item.lines,index,positionStats,now)}));
}

export function parsePgnCollection(text, existingIds = new Set()) {
  const chunks = text.trim().startsWith('[')
    ? text.trim().split(/\n\s*\n(?=\[Event\s)/g)
    : [text.trim()];
  const lines = [];
  chunks.filter(Boolean).forEach((chunk, index) => {
    const chess = new Chess();
    let loaded = false;
    try { chess.loadPgn(chunk, { strict:false }); loaded = chess.history().length > 0; } catch { loaded = false; }
    if (!loaded) {
      const sans = chunk.replace(/\{[^}]*\}|\([^)]*\)|\d+\.(\.\.)?|\d+-\d+|\*|1\/2-1\/2/g, ' ').trim().split(/\s+/).filter(Boolean);
      try { sans.forEach(san => chess.move(san)); loaded = chess.history().length > 0; } catch { loaded = false; }
    }
    if (!loaded || !chess.history().length) return;
    const headers = chess.getHeaders();
    const base = (headers.Opening || headers.Event || `Imported line ${index + 1}`).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || `imported-${index + 1}`;
    let id = `custom-${base}`;
    let suffix = 2;
    while (existingIds.has(id) || lines.some(line => line.id === id)) id = `custom-${base}-${suffix++}`;
    lines.push({ id, name:headers.Variation || headers.Event || `Imported line ${index + 1}`, openingName:headers.Opening || 'Custom repertoire', openingId:'custom-repertoire', repertoireColor:(headers.Color || 'White').toLowerCase() === 'black' ? 'black' : 'white', moves:chess.history() });
  });
  return lines;
}

export function linesToPgn(lines) {
  return lines.map((line, index) => {
    const chess = new Chess();
    chess.header('Event', line.name || `ChessDrill line ${index + 1}`, 'Opening', line.openingName || 'Custom repertoire', 'Color', line.repertoireColor === 'black' ? 'Black' : 'White');
    line.moves.forEach(san => chess.move(san));
    return chess.pgn({ maxWidth: 88 });
  }).join('\n\n');
}

export function openingInsight(name = '') {
  const value = name.toLowerCase().replace(/’/g,"'");
  if (value.includes("king's indian attack")) return { plan:'As White, fianchetto the king bishop, castle, and build toward e4 with Nf3, g3, Bg2, and d3.', break:'e4–e5 can gain space once the center is supported; c4 may challenge Black’s d5 setup.', watch:'The same setup meets several Black defenses. Respond to the center instead of playing the setup automatically.' };
  if (value.includes("king's indian defense")) return { plan:'As Black, fianchetto on g7, castle, and challenge White’s large pawn center.', break:'Prepare …e5 or …c5; in closed centers, …f5 can drive kingside play.', watch:'White has more space. Do not postpone central counterplay indefinitely.' };
  if (value.includes('sicilian')) return { plan:'As Black, exchange a flank c-pawn for White’s central d-pawn and use the open c-file.', break:'The …d5 break can free Black’s position when prepared; …b5 may gain queenside space.', watch:'White can attack the king. Finish development before chasing side pawns.' };
  if (value.includes('slav')) return { plan:'As Black, support d5 with …c6 while leaving the c8 bishop a route outside the pawn chain.', break:'Challenge White’s center with …c5 or, in some structures, …e5.', watch:'If you play …e6 too soon, plan how to develop the light-squared bishop.' };
  if (value.includes("queen's gambit")) return { plan:'As White, pressure d5 with c4, develop, and build enough support for e4.', break:'e4 is a key central expansion; Black often counters with …c5.', watch:'The c4 pawn is less important than development and central control.' };
  if (value.includes('french')) return { plan:'As Black, support …d5 with …e6, then attack the base of White’s pawn chain.', break:'…c5 pressures d4; …f6 can challenge an advanced e5 pawn later.', watch:'Make a route for the c8 bishop trapped behind the e6 pawn.' };
  if (value.includes('caro-kann')) return { plan:'As Black, prepare …d5 with …c6 and develop the c8 bishop before …e6 when possible.', break:'…c5 challenges White’s d4 pawn after development.', watch:'A solid pawn chain does not replace piece development.' };
  if (value.includes('italian')) return { plan:'As White, develop Nf3 and Bc4, castle, and add c3 before opening the center.', break:'Prepare d4 with c3 and active pieces.', watch:'Bishop pressure on f7 needs supporting pieces before a sacrifice.' };
  if (value.includes('ruy lopez')) return { plan:'As White, Bb5 pressures the knight defending e5. Castle, use Re1 and c3, then expand.', break:'d4 challenges Black’s center after e4 is secure.', watch:'Bb5 does not win e5 immediately; keep the bishop active through Black’s …a6 and …b5.' };
  if (value.includes('london')) return { plan:'As White, develop Bf4 before e3, support d4, and castle while watching Black’s setup.', break:'Choose c4 or e4 when your pieces support it; Black often challenges with …c5.', watch:'A familiar setup is not a substitute for meeting threats to d4.' };
  if (value.includes('english')) return { plan:'As White, c4 controls d5 from the flank. Keep the central pawn structure flexible while developing.', break:'d4 or e4 may establish a larger center once Black’s setup is clear.', watch:'The opening often transposes. Judge the pawn structure, not just the move order.' };
  if (value.includes('dutch')) return { plan:'As Black, …f5 contests e4 and aims for active kingside play.', break:'…e5 is a thematic central strike when it is supported.', watch:'Moving the f-pawn weakens squares around the king; develop and castle with care.' };
  if (value.includes('pirc')) return { plan:'As Black, let White build a center, then pressure it with …Nf6, …g6, and …Bg7.', break:'Prepare …e5 or …c5 against White’s d4–e4 center.', watch:'White has extra space and attacking options. Complete development before the counterattack.' };
  if (value.includes('scandinavian')) return { plan:'As Black, challenge e4 immediately with …d5, recapture, and develop while protecting the queen.', break:'…e5 or …c5 can contest White’s center once Black’s pieces are ready.', watch:'Avoid repeated queen moves that give White free developing tempi.' };
  if (value.includes('vienna')) return { plan:'As White, develop Nc3 before Nf3 to keep the f-pawn free for some attacking setups.', break:'f4 can challenge e5; d4 is another central option when prepared.', watch:'If you play f4 early, watch the exposed king and tactical replies.' };
  if (value.includes('scotch')) return { plan:'As White, use an early d4 to open the center and develop pieces to active squares.', break:'d4 challenges e5 at once, so coordinate recaptures before seeking an attack.', watch:'An open center rewards development; avoid spending time chasing pawns.' };
  if (value.includes('four knights')) return { plan:'Develop both knights naturally, then choose a central plan based on Black’s reply.', break:'d4 can challenge e5 after the pieces are ready.', watch:'A symmetrical setup can change quickly; notice pins and central tactics.' };
  return { plan:'Complete development, secure the king, and improve the least-active piece.', break:'Look for the thematic central pawn break created by this structure.', watch:'Memorize the purpose of each move, not only the sequence.' };
}
