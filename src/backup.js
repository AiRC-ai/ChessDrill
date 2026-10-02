import { Chess } from 'chess.js';

const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const bounded = (value, fallback = 0) => Number.isFinite(value) && value >= 0 && value <= 1e12 ? value : fallback;
const limit = (value, choices, fallback) => choices.includes(value) ? value : fallback;

export function validateBackup(data, knownLines, knownOpenings, knownLessons) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || ![1,2].includes(data.version)) {
    throw new Error('This is not a Chess Studio backup.');
  }
  const raw = data.customLines ?? [];
  if (!Array.isArray(raw) || raw.length > 500) throw new Error('The backup has too many custom opening lines.');
  const ids = new Set(knownLines);
  const customLines = raw.map((line, index) => {
    if (!line || !/^custom-[a-z0-9-]{1,90}$/.test(line.id) || ids.has(line.id) ||
        typeof line.name !== 'string' || line.name.length > 200 ||
        typeof line.openingName !== 'string' || line.openingName.length > 200 ||
        !Array.isArray(line.moves) || !line.moves.length || line.moves.length > 200) {
      throw new Error(`Custom opening line ${index + 1} is invalid.`);
    }
    const board = new Chess();
    const moves = line.moves.map(san => {
      if (typeof san !== 'string' || san.length > 30) throw new Error(`Custom opening line ${index + 1} contains an invalid move.`);
      try { return board.move(san).san; }
      catch { throw new Error(`Custom opening line ${index + 1} contains an illegal move.`); }
    });
    ids.add(line.id);
    return {id:line.id,name:line.name,openingName:line.openingName,openingId:'custom-repertoire',repertoireColor:limit(line.repertoireColor,['white','black'],'white'),moves};
  });
  const list = (value, allowed) => Array.isArray(value) ? value.filter(key => typeof key === 'string' && allowed.has(key)) : [];
  const stats = Object.create(null);
  for (const [key, value] of Object.entries(record(data.stats)).slice(0, 20_000)) {
    if (ids.has(key)) {
      const source = record(value);
      stats[key] = {attempts:bounded(source.attempts),correct:bounded(source.correct),completions:bounded(source.completions)};
    }
  }
  const positionStats = Object.create(null);
  for (const [key, value] of Object.entries(record(data.positionStats)).slice(0, 100_000)) {
    if (key.length > 120 || !/^[prnbqkPRNBQK1-8/]+ [wb] [KQkq-]+ (?:[a-h][36]|-)$/.test(key)) continue;
    const source = record(value);
    positionStats[key] = Object.fromEntries(['attempts','correct','streak','ease','intervalDays','avgMs','hints','lapses','dueAt','lastSeen'].map(field => [field,bounded(source[field],field==='ease'?2.2:0)]));
  }
  const lessonCompleted = Object.create(null);
  for (const key of list(Object.keys(record(data.lessonCompleted)),new Set(knownLessons))) lessonCompleted[key] = bounded(data.lessonCompleted[key]);
  const lineRoles = Object.create(null);
  for (const [key, value] of Object.entries(record(data.lineRoles))) if (ids.has(key)) lineRoles[key] = limit(value,['both','white','black'],'both');
  const openingIds = new Set([...knownOpenings,...(customLines.length?['custom-repertoire']:[])]);
  const expanded = list(data.expanded,new Set([...knownOpenings,'custom-repertoire']));
  return {
    customLines,selected:list(data.selected,ids),expanded,
    favoriteOpenings:list(data.favoriteOpenings,openingIds),favoriteLines:list(data.favoriteLines,ids),
    stats,positionStats,lessonCompleted,lineRoles,
    side:limit(data.side,['repertoire','white','black'],'repertoire'),
    focus:limit(data.focus,['all','white','black','selected','favorites'],'all'),
    sort:limit(data.sort,['recommended','eco','name','lines'],'recommended'),
    level:limit(data.level,['beginner','intermediate','advanced'],'beginner'),
    challengeDifficulty:limit(data.challengeDifficulty,['common','varied','wild'],'common'),
    showShortLines:data.showShortLines === true,
    timerSeconds:limit(data.timerSeconds,[0,2,5,15],0),
  };
}
