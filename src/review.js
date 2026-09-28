import { Chess } from 'chess.js';
import { reviewFromGame, reviewFromPgn, reviewSummary } from './movemirror/game-review.ts';
import { explainBestMove, solutionLine, solutionPosition } from './movemirror/explain-move.js';
import { saveTextFile } from './native-export.js';

const CACHE_KEY = 'chess-studio-reviews-v1';
const DECK_KEY = 'chess-studio-mistakes-v1';
const DAY = 86_400_000;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeGameUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['lichess.org','www.lichess.org','chess.com','www.chess.com'].includes(url.hostname) ? url.href : ''; }
  catch { return ''; }
};
const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(value) ? value : fallback; } catch { return fallback; } };
function validCache(item) {
  if (!item || typeof item.id !== 'string' || typeof item.pgn !== 'string' || item.pgn.length > 200_000 ||
      !['w','b'].includes(item.color) || !Array.isArray(item.plies) || !item.plies.length ||
      item.plies.length > 400 || (item.depth !== undefined && !Number.isFinite(item.depth))) return false;
  return item.plies.every(ply => {
    if (!ply || !Number.isSafeInteger(ply.ply) || ply.ply < 1 || ply.ply > 400 ||
        !Number.isSafeInteger(ply.number) || !['w','b'].includes(ply.color) ||
        typeof ply.san !== 'string' || ply.san.length > 30 ||
        !['Opening','Middlegame','Endgame'].includes(ply.phase) ||
        (ply.classification && !['Best','Good','Inaccuracy','Mistake','Blunder'].includes(ply.classification)) ||
        (ply.loss !== undefined && !Number.isFinite(ply.loss)) ||
        (ply.bestMove && !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(ply.bestMove))) return false;
    try { new Chess(ply.beforeFen); new Chess(ply.afterFen); return true; }
    catch { return false; }
  });
}
let cached = read(CACHE_KEY, []).filter(validCache).slice(0,3);
let deck = read(DECK_KEY, []).flatMap(card => { try { return validateMistakeDeck([card]); } catch { return []; } }).slice(0,120);
let render = () => {};
let navigate = () => {};
let studyOpening = () => {};
let abort = null;
const state = {review:null, cursor:0, variation:0, busy:false, percent:0, depth:9, error:'', notice:'', quiz:null, pgnDraft:'', pgnColor:'w', pgnOpen:false, importError:''};

export function connectReview(callbacks) {
  render = callbacks.render;
  navigate = callbacks.navigate;
  studyOpening = callbacks.studyOpening;
}
export function cancelReviewEngine() { abort?.abort(); }

function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cached.slice(0, 3))); }
  catch { /* A large PGN may exceed the browser quota; the review still works this session. */ }
}
function saveDeck() {
  try { localStorage.setItem(DECK_KEY, JSON.stringify(deck.slice(0, 120))); }
  catch { state.notice = 'Browser storage is full. These practice cards may not persist after a reload.'; }
}
export function dueMistakeCount() { return deck.filter(card => card.due <= Date.now()).length; }
export function mistakeDeckSummary() { return {total:deck.length,due:dueMistakeCount(),learned:deck.filter(card=>card.streak>=2).length}; }
export function exportMistakeDeck() { return deck.map(card=>({...card})); }
export function validateMistakeDeck(cards) {
  if (!Array.isArray(cards) || cards.length > 120) throw new Error('The game puzzle backup is invalid.');
  const validated = cards.map(card => {
    if (!card || typeof card.id !== 'string' || card.id.length > 500 || typeof card.fen !== 'string' ||
      typeof card.bestMove !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(card.bestMove) ||
      !['w','b'].includes(card.color) || !Number.isFinite(card.due) || !Number.isFinite(card.streak)) {
      throw new Error('The game puzzle backup contains an invalid position.');
    }
    const board = new Chess(card.fen);
    if (board.turn() !== card.color || !board.moves({verbose:true}).some(move=>`${move.from}${move.to}${move.promotion||''}`===card.bestMove)) {
      throw new Error('The game puzzle backup contains an illegal move.');
    }
    return {
      id:card.id,fen:card.fen,bestMove:card.bestMove,
      bestSan:typeof card.bestSan==='string'?card.bestSan.slice(0,30):'Best move',
      playedSan:typeof card.playedSan==='string'?card.playedSan.slice(0,30):'—',
      opponent:typeof card.opponent==='string'?card.opponent.slice(0,100):'Opponent',
      color:card.color,phase:['Opening','Middlegame','Endgame'].includes(card.phase)?card.phase:'Middlegame',
      gameId:typeof card.gameId==='string'?card.gameId.slice(0,500):'',
      moveNumber:Number.isSafeInteger(card.moveNumber)&&card.moveNumber>0&&card.moveNumber<1000?card.moveNumber:1,
      loss:Number.isFinite(card.loss)?Math.max(0,Math.min(2000,card.loss)):0,mateThreat:!!card.mateThreat,
      bestLine:solutionLine(card.fen,card.bestMove,card.bestLine),
      replySan:typeof card.replySan==='string'?card.replySan.slice(0,24):'',
      replyMove:typeof card.replyMove==='string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(card.replyMove)?card.replyMove:'',
      depth:Number.isFinite(card.depth)?Math.max(1,Math.min(30,card.depth)):null,
      due:card.due,streak:Math.max(0,Math.min(5,card.streak)),
      attempts:Number.isSafeInteger(card.attempts)?Math.max(0,card.attempts):0,
    };
  });
  return validated;
}
export function restoreMistakeDeck(cards) {
  deck = validateMistakeDeck(cards);
  saveDeck();
}

function openReview(source) {
  abort?.abort();
  const match = cached.find(review => review.id === source.id && review.pgn === source.pgn && review.color === source.color);
  state.review = match || source;
  state.cursor = Math.min(10, source.plies.length);
  state.variation = 0;
  state.error = '';
  state.notice = '';
  state.quiz = null;
  state.busy = false;
  navigate('game-review');
}

export function openSampleGame(game, username) {
  try { openReview(reviewFromGame(game, username)); }
  catch (error) { state.error = error.message; render(); }
}

export function submitReviewPgn(event) {
  event.preventDefault();
  const pgn = state.pgnDraft.trim();
  try { state.importError = ''; openReview(reviewFromPgn(pgn, state.pgnColor)); }
  catch (error) { state.pgnOpen = true; state.importError = error.message; render(); }
}

export function reviewImportError() { return state.importError; }

export function reviewPgnFormView() {
  return `<details class="analysis-pgn-details" ${state.pgnOpen||state.importError?'open':''}><summary>Review a PGN instead</summary><section class="review-pgn-import"><div><p class="eyebrow">IMPORT A GAME</p><h2>Review a game from PGN</h2><p>Paste or upload a game, choose your side, then replay it or run an engine review.</p></div><form id="review-pgn-form"><label>Your side<select id="review-color"><option value="w" ${state.pgnColor==='w'?'selected':''}>White</option><option value="b" ${state.pgnColor==='b'?'selected':''}>Black</option></select></label><label class="review-pgn-text">Game PGN<textarea id="review-pgn" placeholder="[Event &quot;My game&quot;]&#10;&#10;1. e4 e5 2. Nf3 ...">${esc(state.pgnDraft)}</textarea></label><button class="secondary" type="submit">Open game review →</button><label class="review-pgn-upload">Or choose a PGN file<input id="review-pgn-file" type="file" accept=".pgn,text/plain"></label>${state.importError?`<p class="analysis-error" role="alert">${esc(state.importError)}</p>`:''}</form></section></details>`;
}

function engineProgress(done, total) {
  state.percent = Math.round(done / total * 100);
  const label = document.querySelector('#review-progress-label');
  const bar = document.querySelector('#review-progress-bar');
  if (label) label.textContent = `Checking move ${done}/${total} · ${state.percent}%`;
  if (bar) bar.style.width = `${state.percent}%`;
}

async function runReviewEngine() {
  if (!state.review || state.busy) return;
  const source = state.review;
  abort = new AbortController();
  const current = abort;
  state.busy = true;
  state.percent = 0;
  state.error = '';
  state.notice = '';
  render();
  try {
    const { analyzeFullGame, engineSupported } = await import('./movemirror/stockfish.ts');
    if (!engineSupported()) throw new Error('This browser cannot run local Stockfish. You can still replay the game.');
    const result = await analyzeFullGame(source, {depth:state.depth,signal:current.signal,onProgress:engineProgress});
    if (state.review?.id !== source.id) return;
    state.review = result;
    cached = [result,...cached.filter(review=>review.id!==result.id || review.color!==result.color)].slice(0,3);
    saveCache();
    state.notice = 'Review complete. Save a missed move to practice it later.';
  } catch (error) {
    if (state.review === source) state.error = error.name === 'AbortError' ? 'Engine review stopped.' : error.message || 'The engine could not review this game.';
  } finally { if (abort === current) { state.busy = false; abort = null; render(); } }
}

function cardFromPly(review, ply) {
  return {
    id:`${review.id}#${review.color}-${ply.ply}`,
    fen:ply.beforeFen,
    bestMove:ply.bestMove,
    bestSan:ply.bestSan,
    playedSan:ply.san,
    opponent:review.opponent,
    color:review.color,
    phase:ply.phase,
    gameId:review.id,
    moveNumber:ply.number,
    loss:ply.loss,
    mateThreat:!!ply.mateThreat,
    bestLine:solutionLine(ply.beforeFen,ply.bestMove,ply.bestLine),
    replySan:ply.replySan || '',
    replyMove:ply.replyMove || '',
    depth:review.depth || null,
    due:Date.now(),
    streak:0,
    attempts:0,
  };
}

export function addMistakeCard(review, ply) {
  if (!review || !ply || ply.color !== review.color || (ply.loss ?? 0) < 60 || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(ply.bestMove || '')) return false;
  const card = cardFromPly(review, ply);
  const existing = deck.find(old => old.id === card.id);
  if (existing) return false;
  deck = [card,...deck].slice(0,120);
  saveDeck();
  return true;
}

function saveAllMistakes() {
  const review = state.review;
  if (!review?.completedAt) return;
  const candidates = review.plies.filter(ply => ply.color === review.color && (ply.loss ?? 0) >= 60)
    .sort((a,b)=>(b.loss??0)-(a.loss??0)).slice(0,20);
  const added = candidates.filter(ply=>addMistakeCard(review,ply)).length;
  state.notice = added ? `${added} missed ${added===1?'move is':'moves are'} ready to practice.` : 'These moves are already in your practice queue.';
  render();
}

function chooseQuiz(ids) {
  if (!ids.length) return;
  state.quiz = {ids,cursor:0,selected:null,hint:0,attempts:0,feedback:'',solved:false,done:0,lineStep:0};
  navigate('review-practice');
}

export function startDueMistakes() {
  chooseQuiz(deck.filter(card=>card.due <= Date.now()).sort((a,b)=>a.due-b.due).map(card=>card.id));
}

export function startAllMistakes() {
  chooseQuiz([...deck].sort((a,b)=>a.due-b.due).map(card=>card.id));
}

function activeCard() { return deck.find(card=>card.id===state.quiz?.ids[state.quiz.cursor]); }

function studyEvidence(card) {
  const source = cached.find(review => review.id === card.gameId);
  const ply = source?.plies.find(item => `${source.id}#${source.color}-${item.ply}` === card.id);
  return {
    ...card,
    bestLine:card.bestLine?.length > 1 ? card.bestLine : ply?.bestLine || card.bestLine || [],
    replySan:card.replySan || ply?.replySan || '',
    replyMove:card.replyMove || ply?.replyMove || '',
    depth:card.depth || source?.depth || null,
  };
}

function nextCard() {
  const quiz = state.quiz;
  if (!quiz) return;
  quiz.cursor++;
  quiz.selected = null;
  quiz.hint = 0;
  quiz.attempts = 0;
  quiz.feedback = '';
  quiz.solved = false;
  quiz.lineStep = 0;
  render();
}

function recordAttempt(card, independentlyCorrect) {
  card.attempts++;
  card.streak = independentlyCorrect ? Math.min(5,(card.streak||0)+1) : 0;
  card.due = Date.now() + (independentlyCorrect ? [DAY,3*DAY,7*DAY,14*DAY,30*DAY][card.streak-1] : 10*60_000);
  saveDeck();
}

export function handleReviewSquare(square) {
  const quiz = state.quiz, card = activeCard();
  if (!quiz || !card || quiz.solved) return;
  const chess = new Chess(card.fen);
  const piece = chess.get(square);
  if (!quiz.selected) {
    if (piece?.color === card.color) { quiz.selected = square; render(); }
    return;
  }
  if (piece?.color === card.color) { quiz.selected = square; render(); return; }
  const options = chess.moves({square:quiz.selected,verbose:true}).filter(move=>move.to===square);
  quiz.selected = null;
  if (!options.length) { quiz.feedback = 'That move is not legal here.'; render(); return; }
  quiz.attempts++;
  if (options.some(move=>`${move.from}${move.to}${move.promotion||''}`===card.bestMove)) {
    const independent = quiz.attempts === 1 && !quiz.hint;
    recordAttempt(card, independent);
    quiz.solved = true;
    quiz.lineStep = 1;
    quiz.done++;
    quiz.feedback = independent ? `Found it: ${card.bestSan}. You will see it again in ${card.streak===1?'one day':card.streak===2?'three days':'a longer interval'}.` : `That's ${card.bestSan}. It will return soon for another try.`;
  } else {
    quiz.hint = Math.max(quiz.hint,1);
    quiz.feedback = 'Legal, but it does not match the engine line. Scan checks, captures, and threats; try again.';
  }
  render();
}

function evalLabel(cp) {
  if (!Number.isFinite(cp)) return '—';
  if (Math.abs(cp)>=50_000) return cp>0?'White mates':'Black mates';
  return `${cp>=0?'+':''}${(cp/100).toFixed(1)}`;
}

function boardHtml(fen, orientation, selected, hint, last) {
  const chess = new Chess(fen), board = chess.board();
  const ranks = orientation === 'w' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const files = orientation === 'w' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const legal = selected ? chess.moves({square:selected,verbose:true}).map(move=>move.to) : [];
  const names = {p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
  return `<div class="board review-board" role="grid" aria-label="Chess position">${ranks.flatMap((rank,ri)=>files.map((file,fi)=>{
    const piece = board[rank][file], square = 'abcdefgh'[file]+(8-rank), dark=(rank+file)%2===1;
    const classes = [dark?'dark':'light',selected===square?'selected':'',legal.includes(square)?'legal':'',hint?.slice(0,2)===square?'hint':'',hint?.length>2&&hint.slice(2,4)===square?'hint-target':'',last?.slice(0,2)===square?'last-from':'',last?.slice(2,4)===square?'last-to':''].join(' ');
    return `<button class="square ${classes}" data-review-square="${square}" aria-label="${square}${piece?` ${piece.color==='w'?'White':'Black'} ${names[piece.type]}`:''}">${piece?`<img class="piece" draggable="false" src="${import.meta.env.BASE_URL}pieces/cburnett/${piece.color}${piece.type.toUpperCase()}.svg" alt="">`:''}${fi===0?`<small class="rank">${8-rank}</small>`:''}${ri===7?`<small class="file">${'abcdefgh'[file]}</small>`:''}</button>`;
  })).join('')}</div>`;
}

function annotatedPgn(review) {
  const original = new Chess();
  original.loadPgn(review.pgn, {strict:false});
  const output = new Chess(review.plies[0].beforeFen);
  for (const [key,value] of Object.entries(original.getHeaders())) output.setHeader(key,value);
  for (const ply of review.plies) {
    output.move(ply.san);
    if (ply.color === review.color && (ply.loss ?? 0) >= 60 && ply.bestMove) {
      const insight = explainBestMove({fen:ply.beforeFen,bestMove:ply.bestMove,bestLine:ply.bestLine,playedSan:ply.san,punishmentMove:ply.replyMove,punishmentSan:ply.replySan,mateThreat:ply.mateThreat,loss:ply.loss});
      output.setComment(`${ply.classification}: ${ply.mateThreat?'mate threat':`${Math.round(ply.loss)} cp lost`}. Try ${ply.bestSan}. ${insight.principle}: ${insight.why} ${insight.contrast} ${insight.line.length>1?`Sample line: ${insight.line.join(' ')}.`:''}`);
    }
  }
  return output.pgn();
}

function downloadReview() {
  const review = state.review;
  if (!review?.completedAt) return;
  saveTextFile(`chess-studio-review-${review.opponent.replace(/[^a-z0-9-]/gi,'_').slice(0,40) || 'game'}.pgn`,annotatedPgn(review),'application/x-chess-pgn');
}

export function handleReviewInput(target) {
  if (target.id === 'review-depth') { state.depth = Number(target.value); return true; }
  if (target.id === 'review-pgn') { state.pgnDraft = target.value; return true; }
  if (target.id === 'review-color') { state.pgnColor = target.value === 'b' ? 'b' : 'w'; return true; }
  if (target.id === 'review-pgn-file') {
    const file = target.files?.[0];
    if (file) {
      state.pgnOpen = true;
      if (file.size > 200_000) { state.importError = 'Choose a single PGN game under 200 KB.'; render(); }
      else file.text().then(value=>{state.pgnDraft=value;state.importError='';render();}).catch(()=>{state.importError='The PGN file could not be read.';render();});
    }
    return true;
  }
  return false;
}

export function handleReviewAction(element) {
  const {action,index} = element.dataset;
  switch (action) {
    case 'review-ply': state.cursor = Math.max(0,Math.min(state.review?.plies.length||0,Number(index))); state.variation=0; render(); return true;
    case 'review-prev': state.cursor = Math.max(0,state.cursor-1); state.variation=0; render(); return true;
    case 'review-next': state.cursor = Math.min(state.review?.plies.length||0,state.cursor+1); state.variation=0; render(); return true;
    case 'review-variation': state.variation = Math.max(0,Math.min(state.review?.plies[state.cursor-1]?.bestLine?.length||0,Number(index))); render(); return true;
    case 'run-review-engine': void runReviewEngine(); return true;
    case 'cancel-review-engine': abort?.abort(); return true;
    case 'save-review-move': {
      const added = addMistakeCard(state.review,state.review?.plies[Number(index)]);
      state.notice = added ? 'Saved to your practice queue.' : 'This position is already saved, or is not an engine-confirmed miss.';
      render(); return true;
    }
    case 'save-review-all': saveAllMistakes(); return true;
    case 'practice-review-move': {
      const ply = state.review?.plies[Number(index)];
      if (addMistakeCard(state.review,ply) || deck.some(card=>card.id===`${state.review?.id}#${state.review?.color}-${ply?.ply}`)) chooseQuiz([`${state.review.id}#${state.review.color}-${ply.ply}`]);
      return true;
    }
    case 'practice-due-mistakes': startDueMistakes(); return true;
    case 'practice-all-mistakes': startAllMistakes(); return true;
    case 'study-review-opening': studyOpening(state.review?.opening); return true;
    case 'export-review-pgn': downloadReview(); return true;
    case 'review-hint': if (state.quiz) {state.quiz.hint=Math.min(2,state.quiz.hint+1);render();} return true;
    case 'review-reveal': {
      const card=activeCard(); if (card && !state.quiz?.solved) {recordAttempt(card,false);state.quiz.solved=true;state.quiz.lineStep=1;state.quiz.done++;state.quiz.hint=2;state.quiz.feedback=`The engine prefers ${card.bestSan}. This card will return in ten minutes.`;render();} return true;
    }
    case 'review-line-step': {
      const card=activeCard(); if (card && state.quiz?.solved) {
        const evidence=studyEvidence(card);
        state.quiz.lineStep=Math.max(0,Math.min(solutionLine(card.fen,card.bestMove,evidence.bestLine).length,Number(index)||0));
        render();
      } return true;
    }
    case 'review-next-card': nextCard(); return true;
    default: return false;
  }
}

export function gameReviewView() {
  const review = state.review;
  if (!review) return '<main class="page"><h1>Choose a game to review.</h1><button data-action="analyze">Analyze games →</button></main>';
  const ply = review.plies[state.cursor-1], analyzed = !!review.completedAt;
  const lineBoard = ply?.bestLine?.length && state.variation ? new Chess(ply.beforeFen) : null;
  if (lineBoard) for (const san of ply.bestLine.slice(0,state.variation)) lineBoard.move(san);
  const fen = lineBoard?.fen() || ply?.afterFen || review.plies[0].beforeFen;
  const summary = reviewSummary(review);
  const current = analyzed && ply?.classification ? ply : null;
  const explanation = current?.bestMove ? explainBestMove({fen:current.beforeFen,bestMove:current.bestMove,bestLine:current.bestLine,playedSan:current.san,punishmentMove:current.replyMove,punishmentSan:current.replySan,mateThreat:current.mateThreat,loss:current.loss}) : null;
  const shownEvaluation = lineBoard ? current?.evalBefore : current?.evalAfter;
  const percent = current ? Math.max(8,Math.min(92,50+42*Math.tanh((shownEvaluation||0)/450))) : 50;
  const player = review.color === 'w' ? 'White' : 'Black';
  return `<main class="page game-review-page"><div class="review-top"><button class="back" data-action="analyze">← Back to analysis</button><span class="eyebrow">GAME REVIEW LAB · ${esc(player.toUpperCase())} SIDE</span></div>
    <section class="review-intro"><div><p class="eyebrow">YOUR GAMES, MOVE BY MOVE</p><h1>You vs ${esc(review.opponent)}</h1><p>${esc(review.opening)} · ${review.plies.length} half-moves · Local Stockfish analysis${review.plies.length>160?' · First 160 half-moves checked':''}</p></div>${safeGameUrl(review.id)?`<a href="${esc(safeGameUrl(review.id))}" target="_blank" rel="noopener noreferrer">Original game ↗</a>`:''}</section>
    <div class="review-layout"><div class="review-board-column"><div class="review-board-wrap"><div class="review-eval" aria-label="White evaluation ${esc(current?evalLabel(shownEvaluation):'unknown')}"><div style="height:${percent}%"></div><span>${esc(current?evalLabel(shownEvaluation):'—')}</span></div>${boardHtml(fen,review.color,null,null,lineBoard?null:ply?.uci)}</div><div class="review-controls"><button data-action="review-ply" data-index="0" aria-label="Go to start">|←</button><button data-action="review-prev" aria-label="Previous move">←</button><strong>${lineBoard?`Engine line ${state.variation}/${ply.bestLine.length}`:ply?`${ply.number}${ply.color==='w'?'.':'...'} ${esc(ply.san)}`:'Starting position'}</strong><button data-action="review-next" aria-label="Next move">→</button><button data-action="review-ply" data-index="${review.plies.length}" aria-label="Go to end">→|</button></div><p class="review-board-caption">${lineBoard?'Showing the engine’s suggested continuation. The evaluation is from before the move, not a new score for this line.':analyzed?'Evaluations are from White’s perspective. Move labels compare the engine’s choice at the selected search depth.':'Replay the moves, then run the engine for decision insights.'}</p></div>
      <div class="review-detail-column"><section class="review-engine-box"><div><p class="eyebrow">STOCKFISH 19 LITE · ON THIS DEVICE</p><h2>${analyzed?'Engine review ready':'Review every decision'}</h2><p>${analyzed?`Depth ${review.depth} · ${review.checkedPlies}/${review.plies.length} half-moves checked. Re-run at another depth if you want a second look.`:'One game at a time. The browser checks each position, including your opponent’s decisions; long games can take a few minutes.'}</p></div><div class="review-engine-actions"><label>Search depth <select id="review-depth" ${state.busy?'disabled':''}><option value="8" ${state.depth===8?'selected':''}>Quick · 8</option><option value="9" ${state.depth===9?'selected':''}>Balanced · 9</option><option value="12" ${state.depth===12?'selected':''}>Deeper · 12</option></select></label>${state.busy?'<button class="secondary" data-action="cancel-review-engine">Stop</button>':`<button class="primary" data-action="run-review-engine">${analyzed?'Recheck game':'Run engine review'} →</button>`}</div>${state.busy?`<div class="review-progress" role="status"><span id="review-progress-label">Loading Stockfish…</span><div><i id="review-progress-bar" style="width:${state.percent}%"></i></div></div>`:''}${state.error?`<p class="analysis-error" role="alert">${esc(state.error)}</p>`:''}${state.notice?`<p class="review-notice" role="status">${esc(state.notice)}</p>`:''}</section>
      <section class="review-insight"><span class="review-badge ${current?current.classification.toLowerCase():''}">${current?esc(current.classification):'Replay'}</span><div><p class="eyebrow">${ply?`${ply.number}${ply.color==='w'?'.':'...'} ${ply.color===review.color?'YOUR MOVE':'OPPONENT MOVE'}`:'STARTING POSITION'}</p><h2>${ply?esc(ply.san):'See the game unfold'}</h2></div>${explanation?`<div class="review-teaching"><small>KEY IDEA · ${esc(explanation.principle)}</small><h3>${esc(explanation.headline)}</h3><p>${esc(explanation.why)}</p>${explanation.contrast?`<p class="review-why-contrast">${esc(explanation.contrast)}</p>`:''}<p class="review-teaching-question"><b>Next time, ask:</b> ${esc(explanation.question)}</p></div>`:`<p>${esc(ply ? 'Run the engine to see what changed after this move.' : 'Select any move below to inspect the board.')}</p>`}${current?`<div class="review-move-metrics"><span><b>${current.mateThreat?'Forced mate':`${Math.round(current.loss)} cp`}</b> ${current.mateThreat?'allowed':'lost'}</span><span><b>${esc(current.bestSan)}</b> engine choice</span><span><b>${esc(evalLabel(current.evalAfter))}</b> after move</span></div>${current.bestLine?.length?`<div class="review-line"><small>EXPLORE ENGINE LINE</small><div><button data-action="review-variation" data-index="0" class="${state.variation===0?'active':''}">Game</button>${current.bestLine.map((san,i)=>`<button data-action="review-variation" data-index="${i+1}" class="${state.variation===i+1?'active':''}">${esc(san)}</button>`).join('')}</div></div>`:''}${current.color===review.color && current.loss>=60?`<button class="primary" data-action="practice-review-move" data-index="${state.cursor-1}">Try the better move →</button>`:''}`:''}</section>
      <section class="review-timeline"><div class="review-section-head"><h3>Move timeline</h3><span>${review.plies.length} half-moves</span></div><div class="review-move-grid">${Array.from({length:Math.ceil(review.plies.length/2)},(_,i)=>`<div class="review-move-pair"><span>${i+1}.</span>${[review.plies[2*i],review.plies[2*i+1]].map(p=>p?`<button class="review-move ${state.cursor===p.ply?'active':''} ${p.classification?`grade-${p.classification.toLowerCase()}`:''}" data-action="review-ply" data-index="${p.ply}" title="${p.classification?esc(p.classification):'Move'}">${esc(p.san)}${p.classification==='Mistake'||p.classification==='Blunder'?' !':''}</button>`:'<span></span>').join('')}</div>`).join('')}</div></section></div></div>
    ${analyzed?`<section class="review-after"><div class="review-section-head"><div><p class="eyebrow">MAKE THE REVIEW STICK</p><h2>Your decision map</h2></div><button class="secondary" data-action="export-review-pgn">Download annotated PGN</button></div><div class="review-stats"><article><strong>${summary.checked}</strong><span>Your decisions checked</span></article><article><strong>${summary.averageLoss??'—'}</strong><span>Average loss on non-mate moves</span></article><article><strong>${summary.mistakes} / ${summary.blunders}</strong><span>Mistakes / blunders</span></article><article><strong>${summary.mateThreats}</strong><span>Moves allowing mate</span></article></div><div class="review-two-col"><section class="analysis-panel"><h3>Where the misses happened</h3>${summary.phases.map(phase=>`<div class="review-phase"><b>${phase.phase}</b><span>${phase.errors} of ${phase.checked} checked moves were flagged</span></div>`).join('')}<p class="review-caveat">Engine scores are estimates at depth ${review.depth}; a second pass may change close calls.</p></section><section class="analysis-panel"><h3>Your turning points</h3>${summary.turningPoints.length?summary.turningPoints.map(p=>`<button class="review-turning-point" data-action="review-ply" data-index="${p.ply}"><span><b>${p.number}${p.color==='w'?'.':'...'} ${esc(p.san)}</b><small>${esc(p.classification)} · ${p.mateThreat?'allowed mate':`${Math.round(p.loss)} cp`} · try ${esc(p.bestSan)}</small></span><span>View →</span></button>`).join(''):'<p>No 60+ cp losses in your checked decisions. Try another game or a deeper pass.</p>'}</section></div><div class="review-callout"><div><p class="eyebrow">YOUR PERSONAL PUZZLE DECK</p><h3>Practice the moves you missed</h3><p>Save your turning points, solve the original positions without seeing the answer, and review them again on a growing schedule.</p></div><div><button class="primary" data-action="save-review-all" ${summary.turningPoints.length?'':'disabled'}>Save up to 20 misses →</button><button class="secondary" data-action="practice-due-mistakes" ${dueMistakeCount()?'':'disabled'}>Practice due (${dueMistakeCount()})</button></div></div></section>`:''}</main>`;
}

export function reviewPracticeView() {
  const quiz = state.quiz, card = activeCard();
  if (!quiz) return '<main class="page"><h1>No practice cards selected.</h1><button data-action="practice">Practice →</button></main>';
  if (!card) return `<main class="page review-finished"><p class="eyebrow">PRACTICE COMPLETE</p><h1>${quiz.done} positions revisited.</h1><p>The next review appears on its due date. Incorrect and revealed moves return sooner.</p><button class="primary" data-action="practice">Back to practice →</button></main>`;
  const evidence = studyEvidence(card);
  const explanation = quiz.solved ? explainBestMove({
    fen:card.fen,bestMove:card.bestMove,bestLine:evidence.bestLine,
    playedSan:card.playedSan,punishmentMove:evidence.replyMove,punishmentSan:evidence.replySan,
    mateThreat:card.mateThreat,loss:card.loss,
  }) : null;
  const position = explanation ? solutionPosition(card.fen,explanation.line,quiz.lineStep) : {fen:card.fen,lastMove:null};
  const hint = quiz.hint ? quiz.hint===1?card.bestMove.slice(0,2):card.bestMove : null;
  return `<main class="drill-page review-study"><div class="drill-head"><button class="back" data-action="practice">← Exit practice</button><div class="drill-meta"><span>YOUR GAME PUZZLES · ${quiz.cursor+1}/${quiz.ids.length}</span><b>Move ${card.moveNumber} vs ${esc(card.opponent)}</b></div><div class="progress-track"><i style="width:${(quiz.cursor/quiz.ids.length)*100}%"></i></div></div><section class="drill-grid"><div>${boardHtml(position.fen,card.color,quiz.solved?null:quiz.selected,quiz.solved?null:hint,position.lastMove)}${explanation?`<p class="review-board-caption">${quiz.lineStep===0?'Starting position':`After ${esc(explanation.line[quiz.lineStep-1])}`} · illustrative engine line</p>`:''}</div><aside class="coach"><p class="eyebrow">${card.color==='w'?'WHITE':'BLACK'} TO MOVE · ${esc(card.phase.toUpperCase())}</p><h2>${quiz.solved?'Understand the answer.':'Find a better move.'}</h2><p class="challenge-context">In your game you played <b>${esc(card.playedSan)}</b> and ${card.mateThreat?'allowed a forced mate':`lost about ${(card.loss/100).toFixed(1)} pawns of evaluation`}. ${quiz.solved?'Compare that decision with the engine line.':'Look for checks, captures, and threats.'}</p><div class="feedback ${quiz.feedback?'show':''}" role="status">${esc(quiz.feedback||'Select a piece and its destination.')}</div>${explanation?`<div class="review-why"><p class="eyebrow">WHY THE ENGINE PREFERS IT</p><h3>${esc(explanation.headline)}</h3><p>${esc(explanation.why)}</p>${explanation.contrast?`<p class="review-why-contrast">${esc(explanation.contrast)}</p>`:''}<p class="review-teaching-question"><b>Next time, ask:</b> ${esc(explanation.question)}</p><div class="review-line"><small>EXPLORE THE SUGGESTED LINE</small><div><button data-action="review-line-step" data-index="0" class="${quiz.lineStep===0?'active':''}">Start</button>${explanation.line.map((san,index)=>`<button data-action="review-line-step" data-index="${index+1}" class="${quiz.lineStep===index+1?'active':''}">${esc(san)}</button>`).join('')}</div></div><small class="review-why-note">One illustrative continuation${evidence.depth?` at depth ${evidence.depth}`:''}; other replies are possible.</small></div><button class="primary wide" data-action="review-next-card">${quiz.cursor+1===quiz.ids.length?'Finish session':'Next position →'}</button>`:`<button class="secondary wide" data-action="review-hint">${quiz.hint===0?'Highlight a piece':quiz.hint===1?'Show destination':'Hint shown'}</button><button class="text-button" data-action="review-reveal">Reveal best move</button>`}</aside></section></main>`;
}
