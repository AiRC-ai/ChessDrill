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

export function positionMastery(stat) {
  if (!stat?.attempts) return 0;
  const accuracy = stat.correct / stat.attempts;
  const retention = Math.min(1, (stat.intervalDays || 0) / 14);
  return Math.round((accuracy * .7 + retention * .3) * 100);
}

export function coverageForLines(lines, index, positionStats, now = Date.now()) {
  const ids = new Set(lines.map(line => line.id));
  const keys = [];
  for (const [key, node] of index) if ([...node.lineIds].some(id => ids.has(id))) keys.push(key);
  const practiced = keys.filter(key => positionStats[key]?.attempts).length;
  const due = keys.filter(key => !positionStats[key] || positionStats[key].dueAt <= now).length;
  const mastery = keys.length ? Math.round(keys.reduce((sum, key) => sum + positionMastery(positionStats[key]), 0) / keys.length) : 0;
  return { positions:keys.length, practiced, due, mastery };
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
  const value = name.toLowerCase();
  if (value.includes('sicilian')) return { plan:'Fight for the center asymmetrically and develop with tempo.', break:'Typical breaks: …d5 or …b5 for Black; f4–f5 for White.', watch:'Watch the c- and d-files and opposite-wing attacks.' };
  if (value.includes('queen\'s gambit') || value.includes('slav')) return { plan:'Build central pressure, finish development, then target the queenside.', break:'Typical breaks: e4 for White; …c5 or …e5 for Black.', watch:'Do not rush to win or hold the c4 pawn at the cost of development.' };
  if (value.includes('king\'s indian')) return { plan:'Accept less queenside space in exchange for a kingside initiative.', break:'Typical breaks: …e5, …c5, and often …f5.', watch:'Timing matters: counterattack before White consolidates.' };
  if (value.includes('french')) return { plan:'Attack the base of White’s pawn chain and activate the light bishop.', break:'Typical breaks: …c5 and …f6.', watch:'Avoid leaving the c8 bishop without a route into the game.' };
  if (value.includes('caro-kann')) return { plan:'Challenge the center while preserving a sound pawn structure.', break:'Typical breaks: …c5 and sometimes …e5.', watch:'Develop the light bishop before closing it in with …e6.' };
  if (value.includes('italian') || value.includes('ruy lopez')) return { plan:'Develop smoothly, castle, and prepare a central d4 break.', break:'Typical break: d4, often supported by c3.', watch:'Improve pieces before launching tactics against the king.' };
  return { plan:'Complete development, secure the king, and improve the least-active piece.', break:'Look for the thematic central pawn break created by this structure.', watch:'Memorize the purpose of each move, not only the sequence.' };
}
