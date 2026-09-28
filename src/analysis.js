import { Chess } from 'chess.js';
import { analyzeGames } from './movemirror/analyze.ts';
import { fetchRecentGames as fetchChessCom, normalizeUsername as normalizeChessCom, validateUsername as validateChessCom } from './movemirror/chesscom.ts';
import { fetchRecentLichessGames as fetchLichess, normalizeLichessUsername as normalizeLichess, validateLichessUsername as validateLichess } from './movemirror/lichess.ts';
import { buildDeepReport } from './movemirror/deep-report.ts';
import { applyEngineAnalysis } from './movemirror/engine-insights.ts';
import { explainBestMove, solutionLine, solutionPosition } from './movemirror/explain-move.js';
import { openSampleGame, reviewPgnFormView } from './review.js';

const STORAGE_KEY = 'chess-studio-analysis-v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const displayPlatform = platform => platform === 'lichess' ? 'Lichess' : 'Chess.com';
const safeUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['lichess.org','www.lichess.org','chess.com','www.chess.com'].includes(url.hostname) ? esc(url.href) : '#';
  } catch { return '#'; }
};

function readStored() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {report: data.report || null, history: Array.isArray(data.history) ? data.history.slice(0, 8) : [], games: Array.isArray(data.games) ? data.games.slice(0, 8) : []};
  } catch { return {report: null, history: [], games: []}; }
}

const stored = readStored();
export const analysis = {
  platform: stored.report?.platform || 'chesscom',
  username: stored.report?.username || '',
  count: 20,
  filter: 'all',
  report: stored.report,
  history: stored.history,
  games: stored.games,
  busy: false,
  engineBusy: false,
  progress: '',
  progressPercent: 0,
  enginePercent: 0,
  error: '',
  showPlan: false,
};
let controller = null;
let render = () => {};
let studyOpening = () => {};
let navigate = () => {};
const puzzle = {index: 0, chess: null, selected: null, feedback: '', hint: 0, solved: false, attempts: 0, lineStep: 0};

export function connectAnalysis(callbacks) {
  render = callbacks.render;
  studyOpening = callbacks.studyOpening;
  navigate = callbacks.navigate;
}

function saveReport(report) {
  const previous = analysis.report;
  if (previous && previous.username.toLowerCase() === report.username.toLowerCase() && previous.platform === report.platform && previous.dateTo !== report.dateTo) {
    analysis.history.unshift({platform: previous.platform, username: previous.username, date: previous.dateTo, games: previous.gamesAnalyzed, score: previous.record.scorePct, weaknesses: previous.weaknesses.map(item => item.title)});
  }
  analysis.history = analysis.history.slice(0, 8);
  analysis.report = report;
  const recentUrls = new Set(report.recentGames.map(game=>game.url));
  const games = analysis.games.filter(game=>recentUrls.has(game.url)).slice(0,8);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({report, history: analysis.history, games})); }
  catch { /* A full browser storage quota should not prevent a report from appearing. */ }
}

export function analysisSummary() {
  const report = analysis.report;
  if (!report) return null;
  return {username: report.username, platform: report.platform, games: report.gamesAnalyzed, score: report.record.scorePct, weakness: report.weaknesses[0]?.title || 'Review your games', theme: report.recommendations[0]?.category || 'Mixed practice'};
}

const formats = {
  chesscom: [['all','All standard'],['rapid','Rapid'],['blitz','Blitz'],['bullet','Bullet'],['daily','Daily']],
  lichess: [['all','All standard'],['rapid','Rapid'],['blitz','Blitz'],['bullet','Bullet'],['ultraBullet','UltraBullet'],['classical','Classical'],['correspondence','Correspondence']],
};

function date(seconds) {
  return seconds ? new Date(seconds * 1000).toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric'}) : '—';
}

function reportView(report) {
  const plan = buildDeepReport(report);
  const old = analysis.history.find(item => item.platform === report.platform && item.username.toLowerCase() === report.username.toLowerCase());
  const delta = old ? Math.round(report.record.scorePct - old.score) : null;
  const engine = report.engineAnalysis;
  return `<section class="analysis-report" id="report">
    <div class="analysis-report-heading"><div><p class="eyebrow">MOVE MIRROR · ${esc(displayPlatform(report.platform))} · ${esc(report.confidence)}</p><h2>@${esc(report.username)}'s training map</h2><p>${report.gamesAnalyzed} standard games · ${date(report.dateFrom)} – ${date(report.dateTo)}${report.gamesSkipped ? ` · ${report.gamesSkipped} games skipped` : ''}</p></div><button class="secondary" data-action="print-report">Print report</button></div>
    <div class="analysis-metrics">
      <article><small>RESULT SCORE</small><strong>${report.record.scorePct}%</strong><span>${report.record.wins} wins · ${report.record.draws} draws · ${report.record.losses} losses${delta === null ? '' : ` · ${delta >= 0 ? '+' : ''}${delta} pts vs last sample`}</span></article>
      <article><small>GAMES REPLAYED</small><strong>${report.gamesAnalyzed}</strong><span>Of ${report.requestedGames} requested</span></article>
      <article><small>AVERAGE RATING</small><strong>${report.averageRating}</strong><span>Opponents averaged ${report.averageOpponentRating}</span></article>
      <article><small>${engine ? 'ENGINE PRECISION' : 'PLATFORM ACCURACY'}</small><strong>${engine ? `${engine.precision.toFixed(1)}%` : report.metrics.averageAccuracy === null ? '—' : `${report.metrics.averageAccuracy.toFixed(1)}%`}</strong><span>${engine ? `${engine.movesAnalyzed} positions checked · ${engine.averageCentipawnLoss.toFixed(0)} ACPL` : report.metrics.accuracySample ? `${report.metrics.accuracySample} games with accuracy data` : 'Only when the source provides it'}</span></article>
    </div>
    <div class="analysis-two-col"><section class="analysis-panel"><p class="eyebrow">KEEP DOING</p><h3>Your strengths</h3>${report.strengths.map(item => finding(item)).join('')}</section><section class="analysis-panel"><p class="eyebrow">WORK ON NEXT</p><h3>Recurring gaps</h3>${report.weaknesses.map(item => finding(item)).join('')}</section></div>
    <section class="analysis-panel"><div class="analysis-section-head"><div><p class="eyebrow">THE PRACTICE QUEUE</p><h3>Three themes from your games</h3></div><span>Start with the first theme</span></div><div class="puzzle-grid">${report.recommendations.map((item,index) => `<article><small>${String(index+1).padStart(2,'0')} / ${index === 0 ? 'START HERE' : index === 1 ? 'NEXT' : 'MAINTAIN'}</small><h4>${esc(item.category)}</h4><p>${esc(item.reason)}</p><strong>${esc(item.practice)}</strong><span>${esc(item.signal)}</span><a href="${report.platform === 'lichess' ? `https://lichess.org/training/${encodeURIComponent(item.lichessTheme)}` : 'https://www.chess.com/puzzles/learning'}" target="_blank" rel="noopener noreferrer">Practice on ${esc(displayPlatform(report.platform))} ↗</a></article>`).join('')}</div></section>
    <div class="analysis-two-col"><section class="analysis-panel"><p class="eyebrow">GAME PHASES</p><h3>Where to focus</h3>${report.phases.map(phase => `<div class="phase-line"><div><b>${esc(phase.phase)}</b><strong>${esc(phase.display)}</strong></div><div class="mastery"><i style="width:${Number(phase.value) || 0}%"></i></div><small>${esc(phase.detail)} · ${phase.sample} games</small></div>`).join('')}</section><section class="analysis-panel"><p class="eyebrow">OPENING BRIDGE</p><h3>Take these into ChessDrill</h3>${report.openings.slice(0, 6).map(opening => `<div class="report-opening"><div><b>${esc(opening.name)}</b><small>${opening.games} ${opening.games===1?'game':'games'} · ${opening.scorePct}% result score</small></div><button class="secondary" data-action="study-opening" data-opening="${esc(opening.name)}">Find lines →</button></div>`).join('') || '<p>More games will reveal recurring openings.</p>'}</section></div>
    <section class="analysis-panel"><div class="analysis-section-head"><div><p class="eyebrow">TURN INSIGHT INTO HABIT</p><h3>Four-week practice plan</h3></div><button class="secondary" data-action="toggle-plan">${analysis.showPlan ? 'Hide plan' : 'Show plan'}</button></div><p>${esc(plan.headline)}</p>${analysis.showPlan ? `<div class="plan-grid">${plan.plan.map(week => `<article><small>WEEK ${week.week}</small><h4>${esc(week.title)}</h4><b>${esc(week.focus)}</b><ul>${week.sessions.map(session => `<li>${esc(session)}</li>`).join('')}</ul><p>${esc(week.checkpoint)}</p></article>`).join('')}</div>` : ''}</section>
    ${engine ? `<section class="analysis-panel"><div class="analysis-section-head"><div><p class="eyebrow">STOCKFISH 19 LITE · LOCAL BROWSER ANALYSIS</p><h3>Critical decisions</h3></div><button class="primary" data-action="train-moments" ${engine.criticalMoments.length?'':'disabled'}>Practice these positions →</button></div><p>${engine.movesAnalyzed} decisions from ${engine.gamesAnalyzed} ${engine.gamesAnalyzed===1?'game':'games'} · ${engine.mistakes} ${engine.mistakes===1?'mistake':'mistakes'} · ${engine.blunders} ${engine.blunders===1?'blunder':'blunders'}</p><div class="evidence-list">${engine.criticalMoments.slice(0, 8).map(moment => `<article><span class="moment-tag">${esc(moment.classification)}</span><div><b>${esc(moment.playedMove)} → ${esc(moment.bestMoveSan)}</b><small>Move ${moment.moveNumber} against ${esc(moment.opponent)} · ${esc(moment.phase)} · ${Math.round(moment.centipawnLoss)} cp lost</small><p>${esc(moment.reason)}</p></div><a href="${safeUrl(moment.gameUrl)}" target="_blank" rel="noopener noreferrer">Game ↗</a></article>`).join('')}</div></section>` : `<section class="engine-panel"><div><p class="eyebrow">GO ONE LEVEL DEEPER</p><h3>Check your decisions with Stockfish</h3><p>Analyze up to 48 decisions in three recent games. The engine runs in your browser; positions stay on your device.${analysis.games.length?'':' Reanalyze this account to enable the engine for a saved report.'}</p></div><button class="primary" data-action="run-engine" ${analysis.games.length && !analysis.engineBusy ? '' : 'disabled'}>${analysis.engineBusy ? `Checking positions… ${analysis.enginePercent}%` : 'Run local engine →'}</button></section>`}
    <section class="analysis-panel"><p class="eyebrow">EVIDENCE FROM YOUR GAMES</p><h3>Moments worth reviewing</h3><div class="evidence-list">${report.trainingPositions.slice(0, 8).map(position => `<article><span class="moment-tag">${esc(position.category)}</span><div><b>Move ${position.moveNumber} · ${esc(position.opening)}</b><small>${esc(position.color)} against ${esc(position.opponent)} · played ${esc(position.playedMove)}</small><p>${esc(position.reason)}</p></div><a href="${safeUrl(position.gameUrl)}" target="_blank" rel="noopener noreferrer">Game ↗</a></article>`).join('') || '<p>No repeated tactical evidence in this sample. Try a larger sample.</p>'}</div></section>
    <section class="analysis-panel"><div class="analysis-section-head"><div><p class="eyebrow">FROM DATA TO DECISIONS</p><h3>Game review lab</h3></div><span>On-demand engine review</span></div><p>Choose a game below to replay every move, check each decision with Stockfish, and save your missed positions to a personal practice deck.</p></section>
    <section class="analysis-panel"><p class="eyebrow">AUDIT TRAIL</p><h3>Games in this sample</h3><div class="report-table-wrap"><table><thead><tr><th>Result</th><th>Opponent</th><th>Color</th><th>Format</th><th>Opening</th><th>Date</th><th>Review</th><th>Game</th></tr></thead><tbody>${report.recentGames.map(game => `<tr><td><span class="result-pill ${esc(game.outcome)}">${esc(game.outcome)}</span></td><td>${esc(game.opponent)} <small>${game.opponentRating}</small></td><td>${esc(game.color)}</td><td>${esc(game.timeClass)}</td><td>${esc(game.opening)}</td><td>${date(game.endTime)}</td><td><button class="review-table-button" data-action="review-game" data-url="${esc(game.url)}" ${analysis.games.some(item=>item.url===game.url)?'':'disabled title="Analyze this account again to load its PGN"'}>Review →</button></td><td><a href="${safeUrl(game.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a></td></tr>`).join('')}</tbody></table></div></section>
  </section>`;
}

function finding(item) {
  return `<div class="finding"><div><b>${esc(item.title)}</b><strong>${esc(item.value)}</strong></div><p>${esc(item.detail)}</p></div>`;
}

export function analysisView() {
  return `<main class="page analysis-page"><section class="analysis-hero"><div><p class="eyebrow">GAME REVIEW</p><h1>Review your games.</h1><p>Analyze a public Chess.com or Lichess account, or import a PGN below.</p></div></section>
    <form id="analysis-form" class="analysis-form"><div class="analysis-form-title"><div><p class="eyebrow">START WITH THE EVIDENCE</p><h2>Analyze a player</h2></div><small>Public games only · No account connection</small></div><div class="analysis-form-grid"><label>Platform<select id="analysis-platform"><option value="chesscom" ${analysis.platform === 'chesscom'?'selected':''}>Chess.com</option><option value="lichess" ${analysis.platform === 'lichess'?'selected':''}>Lichess</option></select></label><label>Username<input id="analysis-username" required autocomplete="off" spellcheck="false" placeholder="Your username" value="${esc(analysis.username)}"></label><label>Recent games<select id="analysis-count">${[10,20,30,50,100].map(n => `<option value="${n}" ${analysis.count === n?'selected':''}>${n} games</option>`).join('')}</select></label><label>Format<select id="analysis-filter">${formats[analysis.platform].map(([value,label])=>`<option value="${value}" ${analysis.filter===value?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="analysis-form-bottom"><span>Standard chess only. Your games are analyzed in this browser.</span><div>${analysis.busy ? '<button class="secondary" type="button" data-action="cancel-analysis">Cancel</button>' : ''}<button class="primary" type="submit" ${analysis.busy?'disabled':''}>${analysis.busy?'Analyzing…':'Analyze games →'}</button></div></div>${analysis.busy ? `<div class="analysis-progress" role="status"><b>${esc(analysis.progress)}</b><span>${analysis.progressPercent}%</span><div><i style="width:${analysis.progressPercent}%"></i></div></div>` : ''}${analysis.error ? `<p class="analysis-error" role="alert">${esc(analysis.error)}</p>` : ''}</form>
    ${reviewPgnFormView()}
    ${analysis.busy ? '' : analysis.report ? reportView(analysis.report) : ''}
    <p class="analysis-privacy">Pattern findings describe the sampled games. Engine review is available separately. Reports stay on this device.</p>
  </main>`;
}

export function handleAnalysisInput(target) {
  if (target.id === 'analysis-username') { analysis.username = target.value; return true; }
  if (target.id === 'analysis-platform') { analysis.platform = target.value; analysis.filter = 'all'; render(); return true; }
  if (target.id === 'analysis-count') { analysis.count = Number(target.value); return true; }
  if (target.id === 'analysis-filter') { analysis.filter = target.value; return true; }
  return false;
}

export function handleAnalysisAction(element) {
  switch (element.dataset.action) {
    case 'cancel-analysis': controller?.abort(); return true;
    case 'run-engine': void runEngine(); return true;
    case 'toggle-plan': analysis.showPlan = !analysis.showPlan; render(); return true;
    case 'print-report': window.print(); return true;
    case 'study-opening': studyOpening(element.dataset.opening); return true;
    case 'train-moments': startMoments(); return true;
    case 'review-game': {
      const game = analysis.games.find(item=>item.url===element.dataset.url);
      if (game) openSampleGame(game,analysis.report.username);
      return true;
    }
    case 'next-moment': startMoments(puzzle.index + 1); return true;
    case 'hint-moment': puzzle.hint = Math.min(2, puzzle.hint + 1); render(); return true;
    case 'reveal-moment': puzzle.feedback = `The engine prefers ${activeMoment()?.bestMoveSan || 'the highlighted move'}.`; puzzle.hint = 2; puzzle.solved = true; puzzle.lineStep = 1; render(); return true;
    case 'moment-line-step': if (puzzle.solved && activeMoment()) { const moment=activeMoment(); puzzle.lineStep=Math.max(0,Math.min(solutionLine(moment.fen,moment.bestMove,moment.bestLine).length,Number(element.dataset.index)||0));render(); } return true;
    default: return false;
  }
}

export async function submitAnalysis(event) {
  event.preventDefault();
  if (analysis.busy) return;
  const platform = analysis.platform;
  const username = platform === 'lichess' ? normalizeLichess(analysis.username) : normalizeChessCom(analysis.username);
  const valid = platform === 'lichess' ? validateLichess(username) : validateChessCom(username);
  if (!valid) { analysis.error = `Enter a valid ${displayPlatform(platform)} username.`; render(); return; }
  controller = new AbortController();
  analysis.busy = true;
  analysis.error = '';
  analysis.progress = 'Finding public games…';
  analysis.progressPercent = 3;
  analysis.username = username;
  analysis.games = [];
  render();
  try {
    const fetched = await (platform === 'lichess' ? fetchLichess : fetchChessCom)({username, count: analysis.count, filter: analysis.filter, signal: controller.signal, onProgress: progress => { analysis.progress = progress.label; analysis.progressPercent = progress.percent; render(); }});
    if (controller.signal.aborted) return;
    analysis.progress = `Replaying ${fetched.games.length} games…`;
    analysis.progressPercent = 78;
    render();
    await new Promise(resolve => requestAnimationFrame(resolve));
    const report = analyzeGames(fetched.profile.username, fetched.games, analysis.count, platform);
    if (controller.signal.aborted) return;
    analysis.games = fetched.games;
    saveReport(report);
    requestAnimationFrame(() => document.querySelector('#report')?.scrollIntoView({behavior:'smooth',block:'start'}));
  } catch (error) {
    analysis.error = controller.signal.aborted ? 'Analysis cancelled.' : error instanceof Error ? error.message : 'Unable to analyze those games.';
  } finally { analysis.busy = false; controller = null; render(); }
}

async function runEngine() {
  if (!analysis.games.length || analysis.engineBusy || !analysis.report) return;
  analysis.engineBusy = true;
  analysis.enginePercent = 0;
  analysis.error = '';
  render();
  try {
    const {analyzeGamesWithEngine, engineSupported} = await import('./movemirror/stockfish.ts');
    if (!engineSupported()) throw new Error('This browser does not support local Stockfish analysis.');
    const engine = await analyzeGamesWithEngine(analysis.games, analysis.report.username, {maxGames:3,maxMoves:48,depth:9,onProgress: progress => {analysis.enginePercent = progress.percent; analysis.progress = progress.label; render();}});
    saveReport(applyEngineAnalysis(analysis.report, engine));
  } catch (error) { analysis.error = error instanceof Error ? error.message : 'Stockfish could not complete this analysis.'; }
  finally { analysis.engineBusy = false; render(); }
}

function moments() { return analysis.report?.engineAnalysis?.criticalMoments || []; }
function activeMoment() { return moments()[puzzle.index]; }
function startMoments(index = 0) {
  const list = moments();
  if (!list.length) return;
  puzzle.index = index % list.length;
  puzzle.chess = new Chess(list[puzzle.index].fen);
  puzzle.selected = null;
  puzzle.feedback = '';
  puzzle.hint = 0;
  puzzle.solved = false;
  puzzle.attempts = 0;
  puzzle.lineStep = 0;
  navigate('puzzle');
}

export function handlePuzzleSquare(square) {
  if (!puzzle.chess || puzzle.solved) return;
  const chess = puzzle.chess;
  const piece = chess.get(square);
  if (!puzzle.selected) {
    if (piece?.color === chess.turn()) { puzzle.selected = square; render(); }
    return;
  }
  if (piece?.color === chess.turn()) { puzzle.selected = square; render(); return; }
  const options = chess.moves({square:puzzle.selected,verbose:true}).filter(move=>move.to===square);
  if (!options.length) { puzzle.selected = null; puzzle.feedback = 'That move is not legal here.'; render(); return; }
  const target = activeMoment()?.bestMove;
  const correct = options.find(move=>`${move.from}${move.to}${move.promotion||''}`===target);
  puzzle.selected = null;
  puzzle.attempts++;
  if (correct) {
    puzzle.solved = true;
    puzzle.lineStep = 1;
    puzzle.feedback = puzzle.attempts === 1 ? `Found it: ${correct.san}.` : `That's the engine move: ${correct.san}.`;
  } else { puzzle.hint = Math.max(1,puzzle.hint); puzzle.feedback = 'Legal, but it misses the strongest continuation. Try again.'; }
  render();
}

export function puzzleView() {
  const moment = activeMoment();
  if (!moment || !puzzle.chess) return '<main class="page"><h1>No positions to review yet.</h1></main>';
  const explanation = puzzle.solved ? explainBestMove({
    fen:moment.fen,bestMove:moment.bestMove,bestLine:moment.bestLine,
    playedSan:moment.playedMove,punishmentMove:moment.punishmentMove,
    punishmentSan:moment.punishmentMoveSan,loss:moment.centipawnLoss,
    reason:moment.reason, mateThreat:moment.category==='Checkmate Patterns',
  }) : null;
  const position = explanation ? solutionPosition(moment.fen,explanation.line,puzzle.lineStep) : {fen:moment.fen,lastMove:null};
  const chess = new Chess(position.fen), board = chess.board(), white = moment.color === 'White';
  const ranks = white ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const files = white ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const legal = puzzle.selected ? chess.moves({square:puzzle.selected,verbose:true}).map(move=>move.to) : [];
  const pieceNames = {p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
  const html = ranks.flatMap((rank,ri)=>files.map((file,fi)=>{
    const item = board[rank][file], square = 'abcdefgh'[file] + (8-rank), dark = (rank+file)%2===1;
    return `<button class="square ${dark?'dark':'light'} ${puzzle.selected===square?'selected':''} ${legal.includes(square)?'legal':''} ${!puzzle.solved&&puzzle.hint&&square===moment.bestMove.slice(0,2)?'hint':''} ${!puzzle.solved&&puzzle.hint>1&&square===moment.bestMove.slice(2,4)?'hint-target':''} ${position.lastMove?.slice(0,2)===square?'last-from':''} ${position.lastMove?.slice(2,4)===square?'last-to':''}" data-square="${square}" aria-label="${square}${item?` ${item.color==='w'?'White':'Black'} ${pieceNames[item.type]}`:''}">${item?`<img class="piece" draggable="false" src="${import.meta.env.BASE_URL}pieces/cburnett/${item.color}${item.type.toUpperCase()}.svg" alt="">`:''}${fi===0?`<small class="rank">${8-rank}</small>`:''}${ri===7?`<small class="file">${'abcdefgh'[file]}</small>`:''}</button>`;
  })).join('');
  return `<main class="drill-page review-study"><div class="drill-head"><button class="back" data-action="analyze">← Back to report</button><div class="drill-meta"><span>MY GAME POSITIONS · ${puzzle.index+1}/${moments().length}</span><b>${esc(moment.opening)} · ${esc(moment.phase)}</b></div><div class="progress-track"><i style="width:${(puzzle.index+1)/moments().length*100}%"></i></div></div><section class="drill-grid"><div><div class="board" role="grid" aria-label="Practice position">${html}</div>${explanation?`<p class="review-board-caption">${puzzle.lineStep===0?'Starting position':`After ${esc(explanation.line[puzzle.lineStep-1])}`} · illustrative engine line</p>`:''}</div><aside class="coach"><p class="eyebrow">${esc(moment.color.toUpperCase())} TO MOVE · AGAINST ${esc(moment.opponent.toUpperCase())}</p><h2>${puzzle.solved?'Understand the answer.':'Find the better move.'}</h2><p class="challenge-context">In your game you played <b>${esc(moment.playedMove)}</b>. ${puzzle.solved?'Compare it with the engine suggestion.':'Take a moment to check the position before asking for a hint.'}</p><div class="feedback ${puzzle.feedback?'show':''}" role="status">${esc(puzzle.feedback || 'Select a piece, then its destination.')}</div>${explanation?`<div class="review-why"><p class="eyebrow">WHY THE ENGINE PREFERS IT</p><h3>${esc(explanation.headline)}</h3><p>${esc(explanation.why)}</p>${explanation.contrast?`<p class="review-why-contrast">${esc(explanation.contrast)}</p>`:''}<div class="review-line"><small>EXPLORE THE SUGGESTED LINE</small><div><button data-action="moment-line-step" data-index="0" class="${puzzle.lineStep===0?'active':''}">Start</button>${explanation.line.map((san,index)=>`<button data-action="moment-line-step" data-index="${index+1}" class="${puzzle.lineStep===index+1?'active':''}">${esc(san)}</button>`).join('')}</div></div><small class="review-why-note">One illustrative continuation at depth ${analysis.report.engineAnalysis.depth}; other replies are possible.</small></div><button class="primary wide" data-action="next-moment">Next position →</button>`:`<button class="secondary wide" data-action="hint-moment">${puzzle.hint===0?'Highlight a piece':puzzle.hint===1?'Show destination':'Hint shown'}</button><button class="text-button" data-action="reveal-moment">Reveal best move</button>`}<a class="moment-game-link" href="${safeUrl(moment.gameUrl)}" target="_blank" rel="noopener noreferrer">Open original game ↗</a></aside></section></main>`;
}
