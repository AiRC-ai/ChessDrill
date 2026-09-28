import { Chess } from 'chess.js';
import { OPENINGS, allLines } from './openings.js';
import { chooseTheoryMove, createDrill, eligibleSelectedLines, parseMove, weightedPick } from './drill.js';
import { buildPositionIndex, coverageForLines, dueReviewKeys, linesToPgn, openingInsight, parsePgnCollection, positionKey, positionOptions, updatePositionStat } from './learning.js';
import { analysisView, analysisSummary, cancelAnalysisWork, connectAnalysis, handleAnalysisAction, handleAnalysisInput, handlePuzzleSquare, puzzleView, submitAnalysis } from './analysis.js';
import { dashboardView } from './dashboard.js';
import { practiceView } from './practice.js';
import { OPENING_LESSONS } from './opening-lessons.js';
import { lessonCatalogView, lessonDetailView, handleLessonAction } from './opening-lessons-ui.js';
import { cancelReviewEngine, connectReview, dueMistakeCount, exportMistakeDeck, gameReviewView, handleReviewAction, handleReviewInput, handleReviewSquare, mistakeDeckSummary, reviewPracticeView, restoreMistakeDeck, submitReviewPgn } from './review.js';
import { saveTextFile } from './native-export.js';
import { validateBackup } from './backup.js';
import './styles.css';

const PIECE_NAMES={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'},MOVE_MS=240,REPLY_PAUSE_MS=380,PIECE_BASE=`${import.meta.env.BASE_URL}pieces/cburnett`;
const BEGINNER=new Set(['Italian Game','Scotch Game','Four Knights Game','Ruy Lopez','Vienna Game',"Queen's Gambit",'London System','English Opening',"King's Indian Attack",'Sicilian Defense','French Defense','Caro-Kann Defense','Scandinavian Defense','Pirc Defense',"King's Indian Defense",'Slav Defense','Dutch Defense']);
const INTERMEDIATE=new Set([...BEGINNER,'Alekhine Defense','Benoni Defense','Benko Gambit',"Bishop's Opening",'Catalan Opening','English Defense','Grünfeld Defense','Modern Defense','Nimzo-Indian Defense','Nimzo-Larsen Attack',"Queen's Indian Defense",'Réti Opening','Semi-Slav Defense','Three Knights Opening','Trompowsky Attack','Bird Opening','Danish Gambit',"King's Gambit","Petrov's Defense",'Philidor Defense']);
const RECOMMENDATIONS=[['Italian Game','Natural development and clear attacking plans.'],["Queen's Gambit",'A principled introduction to positional chess.'],['London System','A dependable setup that is easy to revisit.'],['Caro-Kann Defense','A sound, structured answer to 1.e4.'],['French Defense','Teaches pawn chains and counterplay.'],['Sicilian Defense','Dynamic winning chances against 1.e4.'],['Ruy Lopez','Classic strategic themes at every level.'],["King's Indian Defense",'Active kingside play against 1.d4.']];
const STORAGE_KEY='chessdrill-v2';
function loadSaved(){try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')||{...JSON.parse(localStorage.getItem('chessdrill-v1')||'{}'),version:2};return validateBackup(raw,new Set(allLines().map(l=>l.id)),OPENINGS.map(o=>o.id),OPENING_LESSONS.map(l=>l.id));}catch{return {};}}
const saved=loadSaved(),state={screen:'dashboard',selected:new Set(saved.selected||[]),expanded:new Set(saved.expanded||['italian']),stats:saved.stats||{},positionStats:saved.positionStats||{},lessonCompleted:saved.lessonCompleted||{},lessonFilter:'all',lesson:null,side:saved.side||'repertoire',focus:saved.focus||'all',sort:saved.sort||'eco',query:'',level:saved.level||'beginner',showShortLines:saved.showShortLines||false,challengeDifficulty:saved.challengeDifficulty||'common',timerSeconds:saved.timerSeconds||0,lineRoles:saved.lineRoles||{},customLines:saved.customLines||[],orientation:'white',session:null,challenge:null,selectedSquare:null,message:'',hintLevel:0,pendingOutOfBook:null};
let theoryIndex;
const workingLines=()=>[...allLines(),...state.customLines];
const workingOpenings=()=>state.customLines.length?[...OPENINGS,{id:'custom-repertoire',name:'Custom repertoire',eco:'PGN',color:'white',description:'Your imported lines',lines:state.customLines}]:OPENINGS;
function rebuildIndex(){theoryIndex=buildPositionIndex(workingLines());const valid=new Set(workingLines().map(l=>l.id));state.selected=new Set([...state.selected].filter(id=>valid.has(id)));}rebuildIndex();
function backupData(){return {version:2,selected:[...state.selected],expanded:[...state.expanded],stats:state.stats,positionStats:state.positionStats,lessonCompleted:state.lessonCompleted,side:state.side,focus:state.focus,sort:state.sort,level:state.level,showShortLines:state.showShortLines,challengeDifficulty:state.challengeDifficulty,timerSeconds:state.timerSeconds,lineRoles:state.lineRoles,customLines:state.customLines};}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(backupData()));state.storageNotice='';}catch{state.storageNotice='Device storage is full. Back up your progress to a file before leaving this page.';}}
const esc=v=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const pct=s=>s?.attempts?Math.round(s.correct/s.attempts*100):null;
const lineRole=l=>state.lineRoles[l.id]||'both';
function openingForLevel(o){const keep=l=>state.showShortLines||l.moves.length>=8||l.name==='Main line'||o.id==='custom-repertoire';if(state.level==='advanced')return {...o,lines:o.lines.filter(keep)};const allowed=state.level==='beginner'?BEGINNER:INTERMEDIATE;if(o.id!=='custom-repertoire'&&!allowed.has(o.name))return null;let lines=o.lines.filter(keep);if(state.level==='beginner')lines=lines.filter(l=>l.moves.length<=10||l.name==='Main line');lines.sort((a,b)=>a.moves.length-b.moves.length||a.name.localeCompare(b.name));lines=lines.slice(0,state.level==='beginner'?8:14);return lines.length?{...o,lines,description:`${lines.length} ${state.level} lines`}:null;}
const levelCatalog=()=>workingOpenings().map(openingForLevel).filter(o=>o?.lines.length);
function availableDrillLines(){
  const eligible=new Set(levelCatalog().flatMap(o=>o.lines.map(l=>l.id)));
  return eligibleSelectedLines(workingLines(),state.selected,eligible).filter(l=>{
    const side=state.side==='repertoire'?l.repertoireColor:state.side;
    return lineRole(l)==='both'||lineRole(l)===side;
  });
}
function challengeLines(d=state.challengeDifficulty){const allowed=d==='common'?BEGINNER:d==='varied'?INTERMEDIATE:null,per=d==='common'?10:d==='varied'?28:Infinity;return workingOpenings().filter(o=>o.id==='custom-repertoire'||!allowed||allowed.has(o.name)).flatMap(o=>o.lines.filter(l=>l.moves.length>=8).sort((a,b)=>b.moves.length-a.moves.length).slice(0,per).map(l=>({...l,openingId:o.id,openingName:o.name})));}
function selectedPositionKeys(){if(!state.selected.size)return new Set();return new Set([...theoryIndex].filter(([,n])=>[...n.lineIds].some(id=>state.selected.has(id))).map(([k])=>k));}
function appShell(content){
  const active=state.screen==='dashboard'?'dashboard':
    ['analysis','puzzle','game-review'].includes(state.screen)?'analyze':
    ['library','lessons','lesson'].includes(state.screen)?'home':
    ['practice','drill','review-practice','challenge-setup','challenge-play'].includes(state.screen)?'practice':'progress';
  const links=[['dashboard','Home','⌂'],['analyze','Games','♟'],['home','Openings','▦'],['practice','Practice','↗'],['progress','Progress','◷']];
  return `<header class="topbar"><button class="brand" data-action="dashboard" aria-label="Chess Studio home"><span class="brand-mark"><img src="${import.meta.env.BASE_URL}chess-studio-icon.svg" alt=""></span><span>Chess<span>Studio</span></span></button><nav aria-label="Main navigation">${links.map(([action,label,icon])=>`<button class="nav-link ${active===action?'active':''}" data-action="${action}" ${active===action?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}</nav></header>${state.storageNotice?`<p class="storage-warning" role="alert">${esc(state.storageNotice)}</p>`:''}${content}`;
}

function recommendationsView(){return `<section class="recommended"><div class="section-heading"><div><p class="eyebrow">RECOMMENDED OPENINGS</p><h2>A strong place to start</h2></div><p>Balanced, practical repertoires</p></div><div class="recommendation-grid">${RECOMMENDATIONS.map(([name,reason])=>{const o=workingOpenings().find(x=>x.name===name),v=o&&(openingForLevel(o)||o);if(!v)return'';const added=v.lines.every(l=>state.selected.has(l.id));return `<article><span class="color-dot ${o.color}">${o.color==='white'?'W':'B'}</span><div><b>${esc(name)}</b><p>${esc(reason)}</p><small>${v.lines.length} foundational lines</small></div><button class="${added?'added':''}" data-action="recommend" data-id="${o.id}">${added?'✓ Added':'+ Add'}</button></article>`;}).join('')}</div></section>`;}
function openingCard(o){const expanded=state.expanded.has(o.id),count=o.lines.filter(l=>state.selected.has(l.id)).length,all=count===o.lines.length,some=count>0&&!all;return `<article class="opening-card ${expanded?'expanded':''}"><div class="opening-summary"><button class="opening-toggle ${all?'checked':''} ${some?'partial':''}" data-action="toggle-opening" data-id="${o.id}"><span>✓</span></button><button class="opening-details" data-action="expand" data-id="${o.id}"><span class="color-dot ${o.color}">${o.color==='white'?'W':'B'}</span><span class="opening-title"><b>${esc(o.name)}</b><small>${o.eco} · ${esc(o.description)}</small></span><span class="line-count">${count}/${o.lines.length} lines</span><span class="chevron">⌄</span></button></div>${expanded?`<div class="line-list"><div class="line-list-head"><span>VARIATION</span><span>ROLE</span><button data-action="toggle-opening" data-id="${o.id}">${all?'Deselect all':'Select all'}</button></div>${o.lines.map(l=>`<div class="line-row"><label><input type="checkbox" data-line="${l.id}" ${state.selected.has(l.id)?'checked':''}><span class="fake-check">✓</span></label><span><b>${esc(l.name)}</b><small>${esc(l.moves.join(' '))}</small></span><select data-role="${l.id}"><option value="both" ${lineRole(l)==='both'?'selected':''}>Both</option><option value="white" ${lineRole(l)==='white'?'selected':''}>White</option><option value="black" ${lineRole(l)==='black'?'selected':''}>Black</option></select><span class="accuracy">${pct(state.stats[l.id])===null?'New':pct(state.stats[l.id])+'%'}</span></div>`).join('')}</div>`:''}</article>`;}
function startSession(review=false,forcedLine=null){let line,color,startPly=0;if(review){const key=dueReviewKeys(state.positionStats,selectedPositionKeys())[0];if(!key)return;const node=theoryIndex.get(key),id=[...node.lineIds].find(x=>state.selected.has(x));line=workingLines().find(l=>l.id===id);const chess=new Chess();startPly=line.moves.findIndex((san,i)=>{const match=positionKey(chess.fen())===key;chess.move(san);return match;});color=node.turn==='w'?'white':'black';}else if(forcedLine){line=forcedLine;color=line.repertoireColor;}else{line=weightedPick(availableDrillLines(),state.stats);if(!line)return;color=state.side==='repertoire'?line.repertoireColor:state.side;}const drill=createDrill(line,color),chess=new Chess();for(let i=0;i<startPly;i++)chess.move(drill.positions[i].san);const turn=color==='white'?'w':'b';state.session={drill,chess,cursor:startPly,userMoves:0,mistakes:0,complete:false,busy:drill.positions[startPly]?.turn!==turn,lastMove:null,review,promptStartedAt:Date.now(),mistakePositions:[]};state.orientation=color;state.selectedSquare=null;state.message='';state.hintLevel=0;state.screen='drill';render();setTimeout(advanceOpponent,REPLY_PAUSE_MS);}
async function advanceOpponent(){const s=state.session;if(!s||s.complete)return;const turn=s.drill.color==='white'?'w':'b';while(s.cursor<s.drill.positions.length&&s.drill.positions[s.cursor].turn!==turn){s.busy=true;const p=s.drill.positions[s.cursor];await animateMove(p.from,p.to);if(state.session!==s)return;s.chess.move(p.san);s.lastMove={from:p.from,to:p.to};s.cursor++;s.busy=false;render();if(s.cursor<s.drill.positions.length&&s.drill.positions[s.cursor].turn!==turn)await delay(REPLY_PAUSE_MS);}s.promptStartedAt=Date.now();if(s.cursor>=s.drill.positions.length)finishLine();render();}
function recordPosition(s,correct,hinted=false){const p=s.drill.positions[s.cursor];if(!p)return;const key=positionKey(p.fen);state.positionStats[key]=updatePositionStat(state.positionStats[key],{correct,hinted,responseMs:Date.now()-s.promptStartedAt});if(!correct&&!s.mistakePositions.includes(key))s.mistakePositions.push(key);save();}
function finishLine(){const s=state.session;if(!s||s.complete)return;s.complete=true;const old=state.stats[s.drill.line.id]||{attempts:0,correct:0,completions:0};state.stats[s.drill.line.id]={attempts:old.attempts+s.userMoves,correct:old.correct+Math.max(0,s.userMoves-s.mistakes),completions:(old.completions||0)+1};save();}

function challengeSetupView(){return appShell(`<main class="challenge-setup page"><button class="back" data-action="practice">← Back to practice</button><section class="challenge-intro"><p class="eyebrow">REAL-GAME PRACTICE</p><h1>Theory Challenge</h1><p>Start as a random color, play any documented theoretical move, and face replies selected from the position—not a rigid move sequence. Transpositions are recognized.</p></section><section class="difficulty-grid">${['common','varied','wild'].map(id=>`<button class="${state.challengeDifficulty===id?'active':''}" data-action="challenge-difficulty" data-id="${id}"><span class="difficulty-icon">${id==='common'?'♙':id==='varied'?'♞':'♛'}</span><b>${id==='wild'?'Unpredictable':id[0].toUpperCase()+id.slice(1)}</b><small>${id==='common'?'Mainstream replies':id==='varied'?'Broader theory':'Full catalog'}</small><p>${id==='common'?'Frequent openings and branches.':id==='varied'?'More families and sidelines.':'Rare responses weighted more evenly.'}</p><em>${challengeLines(id).length.toLocaleString()} eligible lines</em></button>`).join('')}</section><div class="challenge-start"><p><b>Every round randomizes your color.</b><br>When you leave the book, you decide whether to retry or continue.</p><button class="primary" data-action="start-challenge">Start challenge →</button></div></main>`);}
const challengeOptions=c=>positionOptions(theoryIndex,c.chess.fen(),c.eligibleIds);
function startChallenge(){const lines=challengeLines(),color=Math.random()<.5?'white':'black';state.challenge={chess:new Chess(),eligibleIds:new Set(lines.map(l=>l.id)),color,cursor:0,targetPly:state.challengeDifficulty==='common'?10:state.challengeDifficulty==='varied'?14:18,correct:0,mistakes:0,complete:false,busy:color==='black',lastMove:null,openingName:'Starting position'};state.orientation=color;state.selectedSquare=null;state.message='';state.hintLevel=0;state.pendingOutOfBook=null;state.screen='challenge-play';render();if(color==='black')setTimeout(advanceChallengeOpponent,REPLY_PAUSE_MS);}
function updateChallengeOpening(c){const node=theoryIndex.get(positionKey(c.chess.fen())),names=node?[...node.openings]:[];c.openingName=names.length===1?names[0]:names.length<4&&names.length?names.join(' / '):names.length?`${names.length} possible openings`:'Out of book';}
async function advanceChallengeOpponent(){const c=state.challenge;if(!c||c.complete)return;const choice=chooseTheoryMove(challengeOptions(c),state.challengeDifficulty);if(!choice)return finishChallenge('Theory branch complete');const move=c.chess.moves({verbose:true}).find(m=>m.san===choice.san);if(!move)return finishChallenge('Theory branch complete');c.busy=true;await animateMove(move.from,move.to);if(state.challenge!==c)return;c.chess.move(choice.san);c.cursor++;c.lastMove={from:move.from,to:move.to};c.busy=false;updateChallengeOpening(c);render();if(c.cursor>=c.targetPly)return finishChallenge('Target depth reached');if(!challengeOptions(c).size)return finishChallenge('Theory branch complete');}
function finishChallenge(reason){const c=state.challenge;if(!c||c.complete)return;c.complete=true;c.busy=false;c.reason=reason;render();}

function boardHtml(chess,orientation){const board=chess.board(),ranks=orientation==='white'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0],files=orientation==='white'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0],selected=state.screen==='lesson'?null:state.selectedSquare,legal=selected?chess.moves({square:selected,verbose:true}).map(m=>m.to):[],active=state.screen==='lesson'?null:state.screen==='challenge-play'?state.challenge:state.session;let sources=[],targets=[];if(state.hintLevel&&state.screen==='challenge-play'){const sans=new Set(challengeOptions(state.challenge).keys()),moves=chess.moves({verbose:true}).filter(m=>sans.has(m.san));sources=moves.map(m=>m.from);if(state.hintLevel>1)targets=moves.map(m=>m.to);}else if(state.hintLevel&&state.session){const p=state.session.drill.positions[state.session.cursor];sources=[p?.from];if(state.hintLevel>1)targets=[p?.to];}return `<div class="board" role="grid" aria-label="Chess position">${ranks.flatMap((r,ri)=>files.map((f,fi)=>{const p=board[r][f],sq='abcdefgh'[f]+(8-r),dark=(r+f)%2===1,code=p?`${p.color}${p.type.toUpperCase()}`:'';return `<button class="square ${dark?'dark':'light'} ${selected===sq?'selected':''} ${legal.includes(sq)?'legal':''} ${sources.includes(sq)?'hint':''} ${targets.includes(sq)?'hint-target':''} ${active?.lastMove?.from===sq?'last-from':''} ${active?.lastMove?.to===sq?'last-to':''}" ${state.screen==='lesson'?'disabled':''} data-square="${sq}">${p?`<img class="piece" draggable="false" src="${PIECE_BASE}/${code}.svg" alt="${p.color==='w'?'White':'Black'} ${PIECE_NAMES[p.type]}">`:''}${fi===0?`<small class="rank">${8-r}</small>`:''}${ri===7?`<small class="file">${'abcdefgh'[f]}</small>`:''}</button>`;})).join('')}</div>`;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function animateMove(from,to){const source=document.querySelector(`[data-square="${from}"] .piece`),target=document.querySelector(`[data-square="${to}"]`);if(!source||!target)return Promise.resolve();const a=source.getBoundingClientRect(),b=target.getBoundingClientRect(),ghost=source.cloneNode(true);ghost.classList.add('moving-piece');Object.assign(ghost.style,{left:`${a.left}px`,top:`${a.top}px`,width:`${a.width}px`,height:`${a.height}px`});source.style.opacity='0';document.body.appendChild(ghost);return new Promise(resolve=>{requestAnimationFrame(()=>requestAnimationFrame(()=>ghost.style.transform=`translate(${b.left-a.left}px,${b.top-a.top}px)`));setTimeout(()=>{ghost.remove();resolve();},MOVE_MS);});}
function insightHtml(name){const x=openingInsight(name);return `<div class="insight"><b>Plan</b><p>${esc(x.plan)}</p><b>Pawn breaks</b><p>${esc(x.break)}</p><b>Watch for</b><p>${esc(x.watch)}</p></div>`;}
function drillView(){const s=state.session,progress=Math.round(s.cursor/Math.max(1,s.drill.positions.length)*100),elapsed=Math.floor((Date.now()-s.promptStartedAt)/1000),timer=state.timerSeconds?`${Math.max(0,state.timerSeconds-elapsed)}s`:'Untimed';return appShell(`<main class="drill-page"><section class="drill-head"><button class="back" data-action="practice">← Exit drill</button><div class="drill-meta"><span>${s.review?'MISTAKE REVIEW':esc(s.drill.line.openingName)}</span><b>${esc(s.drill.line.name)}</b></div><div class="progress-track"><i style="width:${progress}%"></i></div><span>${s.cursor}/${s.drill.positions.length} ply</span></section><section class="drill-grid"><div>${boardHtml(s.chess,state.orientation)}</div><aside class="coach ${s.complete?'complete':''}">${s.complete?`<div class="result-icon">✓</div><p class="eyebrow">${s.review?'REVIEW COMPLETE':'LINE COMPLETE'}</p><h2>${s.mistakes?'Nice recovery.':'Clean run.'}</h2><p>You played ${s.userMoves} moves with ${s.mistakes} mistakes.</p>${insightHtml(s.drill.line.openingName)}${s.mistakePositions.length?'<button class="secondary wide" data-action="review">Repeat weak positions</button>':''}<button class="primary wide" data-action="next">Drill another line →</button>`:`<p class="eyebrow">YOUR MOVE · ${s.drill.color.toUpperCase()} · ${timer}</p><h2>Find the repertoire move.</h2><p class="sequence">${s.drill.line.moves.slice(0,s.cursor).map((m,i)=>`<span class="${i===s.cursor-1?'last':''}">${m}</span>`).join(' ')||'Opening position'}</p><div class="feedback ${state.message?'show':''}">${state.message||'Select a piece, then its destination.'}</div><button class="secondary wide" data-action="hint">${state.hintLevel===0?'Highlight the piece':state.hintLevel===1?'Show destination':'Hint shown'}</button><button class="text-button" data-action="reveal">Reveal & continue</button>`}</aside></section></main>`);}
function challengeView(){const c=state.challenge,o=challengeOptions(c);return appShell(`<main class="drill-page"><section class="drill-head"><button class="back" data-action="challenge">← Exit challenge</button><div class="drill-meta"><span>THEORY CHALLENGE · ${state.challengeDifficulty.toUpperCase()}</span><b>${esc(c.openingName)}</b></div><div class="progress-track"><i style="width:${Math.round(c.cursor/c.targetPly*100)}%"></i></div><span>${c.cursor}/${c.targetPly} ply</span></section><section class="drill-grid"><div>${boardHtml(c.chess,state.orientation)}</div><aside class="coach ${c.complete?'complete':''}">${c.complete?`<div class="result-icon">✓</div><p class="eyebrow">CHALLENGE COMPLETE</p><h2>${c.mistakes?'You adapted.':'Theory held.'}</h2><p>${esc(c.reason)}. ${c.correct} theoretical moves, ${c.mistakes} misses.</p><button class="primary wide" data-action="start-challenge">New random challenge →</button>`:`<p class="eyebrow">YOU ARE ${c.color.toUpperCase()}</p><h2>Stay inside theory.</h2><div class="challenge-badges"><span>${o.size} theory ${o.size===1?'move':'moves'}</span><span>Transpositions on</span></div><div class="feedback ${state.message?'show':''}">${state.message||'Play any documented move from this position.'}</div>${state.pendingOutOfBook?`<button class="primary wide" data-action="retry-book">Try a theory move</button><button class="secondary wide" data-action="continue-book">Continue anyway</button>`:`<button class="secondary wide" data-action="hint">${state.hintLevel===0?'Highlight valid pieces':'Show destinations'}</button>`}`}</aside></section></main>`);}
async function tryMove(square){const s=state.session;if(!s||s.complete||s.busy)return;const piece=s.chess.get(square),turn=s.chess.turn();if(!state.selectedSquare){if(piece?.color===turn){state.selectedSquare=square;state.message='';render();}return;}if(piece?.color===turn){state.selectedSquare=square;render();return;}const move=parseMove(s.chess,state.selectedSquare,square);if(!move){state.selectedSquare=null;state.message='That piece cannot move there.';render();return;}const expected=s.drill.positions[s.cursor],timedOut=state.timerSeconds&&Date.now()-s.promptStartedAt>state.timerSeconds*1000;if(move.from===expected.from&&move.to===expected.to&&!timedOut){recordPosition(s,true,state.hintLevel>0);s.busy=true;state.selectedSquare=null;state.message='Correct — keep going.';state.hintLevel=0;render();await animateMove(move.from,move.to);if(state.session!==s)return;s.chess.move(move.san);s.lastMove={from:move.from,to:move.to};s.cursor++;s.userMoves++;render();if(s.cursor>=s.drill.positions.length){s.busy=false;finishLine();render();return;}await delay(REPLY_PAUSE_MS);if(state.session===s)advanceOpponent();}else{recordPosition(s,false,state.hintLevel>0);s.mistakes++;s.userMoves++;state.selectedSquare=null;state.message=timedOut?'Time expired. The correct piece is highlighted.':'Not the repertoire move. The correct piece is highlighted.';state.hintLevel=Math.max(1,state.hintLevel);render();}}
async function tryChallengeMove(square){const c=state.challenge;if(!c||c.complete||c.busy)return;const piece=c.chess.get(square),turn=c.chess.turn();if(!state.selectedSquare){if(piece?.color===turn){state.selectedSquare=square;state.message='';render();}return;}if(piece?.color===turn){state.selectedSquare=square;render();return;}const move=parseMove(c.chess,state.selectedSquare,square);if(!move){state.selectedSquare=null;state.message='That piece cannot move there.';render();return;}if(!challengeOptions(c).get(move.san)){c.mistakes++;state.selectedSquare=null;state.pendingOutOfBook=move;state.message='That legal move leaves the documented repertoire. Retry or continue and see whether it transposes back.';render();return;}await acceptChallengeMove(c,move);}
async function acceptChallengeMove(c,move){c.busy=true;state.selectedSquare=null;state.message='Theory matched.';state.hintLevel=0;state.pendingOutOfBook=null;render();await animateMove(move.from,move.to);if(state.challenge!==c)return;c.chess.move(move);c.cursor++;c.correct++;c.lastMove={from:move.from,to:move.to};updateChallengeOpening(c);render();if(c.cursor>=c.targetPly)return finishChallenge('Target depth reached');if(!challengeOptions(c).size)return finishChallenge('Theory branch complete');await delay(REPLY_PAUSE_MS);if(state.challenge===c)advanceChallengeOpponent();}
function download(name,text,type='text/plain'){saveTextFile(name,text,type);}
function handleClick(e){
  const reviewSquare=e.target.closest('[data-review-square]');
  if(reviewSquare)return state.screen==='review-practice'?handleReviewSquare(reviewSquare.dataset.reviewSquare):undefined;
  const square=e.target.closest('[data-square]');
  if(square)return state.screen==='lesson'?undefined:state.screen==='puzzle'?handlePuzzleSquare(square.dataset.square):state.screen==='challenge-play'?tryChallengeMove(square.dataset.square):tryMove(square.dataset.square);
  const el=e.target.closest('[data-action]');
  if(!el)return;
  const {action,id}=el.dataset;
  if(state.screen==='game-review'&&['dashboard','analyze','home','practice','progress','challenge','lessons'].includes(action))cancelReviewEngine();
  if(['analysis','puzzle'].includes(state.screen)&&['dashboard','home','practice','progress','challenge','lessons'].includes(action))cancelAnalysisWork();
  const destinations={dashboard:'dashboard',analyze:'analysis',home:'library',practice:'practice',progress:'progress'};
  if(Object.hasOwn(destinations,action)){
    state.screen=destinations[action];
    state.session=null;state.challenge=null;state.selectedSquare=null;
    render();window.scrollTo(0,0);return;
  }
  if(handleReviewAction(el))return;
  if(handleAnalysisAction(el))return;
  if(handleLessonAction(el,{state,render,save,startSession,openings:workingOpenings}))return;
  if(action==='challenge'){
    state.screen='challenge-setup';state.challenge=null;state.session=null;
    render();window.scrollTo(0,0);return;
  }
  if(action==='challenge-difficulty'){state.challengeDifficulty=id;save();}
  if(action==='start-challenge')return startChallenge();
  if(action==='expand'){state.expanded.has(id)?state.expanded.delete(id):state.expanded.add(id);save();}
  if(action==='select-visible'){levelCatalog().forEach(o=>o.lines.forEach(l=>state.selected.add(l.id)));save();}
  if(action==='clear'){state.selected.clear();save();}
  if(action==='toggle-opening'||action==='recommend'){
    const full=workingOpenings().find(o=>o.id===id),o=openingForLevel(full)||full,all=o.lines.every(l=>state.selected.has(l.id));
    o.lines.forEach(l=>all?state.selected.delete(l.id):state.selected.add(l.id));save();
  }
  if(action==='level'){state.level=id;state.query='';save();}
  if(action==='toggle-short'){state.showShortLines=!state.showShortLines;save();}
  if(action==='start'||action==='next')return startSession();
  if(action==='review')return startSession(true);
  if(action==='hint')state.hintLevel=Math.min(2,state.hintLevel+1);
  if(action==='reveal'){
    const s=state.session;if(s.busy)return;
    const p=s.drill.positions[s.cursor];recordPosition(s,false,true);
    s.busy=true;state.message='Move revealed.';state.hintLevel=0;render();
    animateMove(p.from,p.to).then(async()=>{
      if(state.session!==s)return;
      s.chess.move(p.san);s.lastMove={from:p.from,to:p.to};s.cursor++;s.userMoves++;s.mistakes++;
      render();await delay(REPLY_PAUSE_MS);if(state.session===s)advanceOpponent();
    });return;
  }
  if(action==='retry-book'){state.pendingOutOfBook=null;state.message='Choose a documented continuation.';state.hintLevel=1;}
  if(action==='continue-book'){
    const c=state.challenge,move=state.pendingOutOfBook;state.pendingOutOfBook=null;
    if(move)return acceptChallengeMove(c,move);
  }
  if(action==='export-pgn')download('chessdrill-repertoire.pgn',linesToPgn(workingLines().filter(l=>state.selected.has(l.id))),'application/x-chess-pgn');
  if(action==='export-data')download('chessdrill-backup.json',JSON.stringify({...backupData(),reviewCards:exportMistakeDeck()},null,2),'application/json');
  if(action==='reset-stats'&&confirm('Reset all ChessDrill progress?')){state.stats={};state.positionStats={};save();}
  render();
}
function handleChange(e){
  const t=e.target;
  if(e.type==='input' && t.type==='file')return;
  if(handleReviewInput(t)||handleAnalysisInput(t))return;
  if(t.matches('[data-line]')){t.checked?state.selected.add(t.dataset.line):state.selected.delete(t.dataset.line);save();render();return;}
  if(t.matches('[data-role]')){state.lineRoles[t.dataset.role]=t.value;save();return;}
  if(t.id==='side'){state.side=t.value;save();return;}
  if(t.id==='timer'){state.timerSeconds=Number(t.value);save();return;}
  if(t.id==='focus'){state.focus=t.value;save();render();return;}
  if(t.id==='sort'){state.sort=t.value;save();render();return;}
  if(t.id==='catalog-search'){state.query=t.value;updateOpeningResults();return;}
  if(t.id==='import-file' && t.files?.[0]) void importStudyFile(t.files[0]);
}

async function importStudyFile(file){
  state.progressImportOpen=true;
  if(file.size>2_000_000){state.importNotice='Choose a file under 2 MB.';render();return;}
  try{
    const text=await file.text();
    const known=new Set(allLines().map(line=>line.id));
    if(/\.json$/i.test(file.name)){
      const raw=JSON.parse(text);
      const data=validateBackup(raw,known,OPENINGS.map(o=>o.id),OPENING_LESSONS.map(l=>l.id));
      const nextIndex=buildPositionIndex([...allLines(),...data.customLines]);
      if(Object.hasOwn(raw,'reviewCards'))restoreMistakeDeck(raw.reviewCards);
      Object.assign(state,{...data,selected:new Set(data.selected),expanded:new Set(data.expanded)});
      theoryIndex=nextIndex;
      state.importNotice='Backup imported. Your openings and practice history are ready.';
    }else{
      const lines=parsePgnCollection(text,new Set(workingLines().map(line=>line.id)));
      if(!lines.length)throw new Error('No playable chess lines were found in that PGN.');
      const validated=validateBackup({...backupData(),customLines:[...state.customLines,...lines]},known,OPENINGS.map(o=>o.id),OPENING_LESSONS.map(l=>l.id));
      const nextIndex=buildPositionIndex([...allLines(),...validated.customLines]);
      state.customLines=validated.customLines;
      for(const line of lines)state.selected.add(line.id);
      state.expanded.add('custom-repertoire');
      theoryIndex=nextIndex;
      state.importNotice=`${lines.length} ${lines.length===1?'opening line':'opening lines'} imported and selected.`;
    }
    save();render();
  }catch(error){state.importNotice=error instanceof Error?error.message:'That file could not be imported.';render();}
}

function studyOpening(name){cancelAnalysisWork();cancelReviewEngine();const normalized=s=>s.toLowerCase().replace(/[’']/g,'').replace(/\b([a-z]{3,})s\b/g,'$1').replace(/[^a-z0-9]/g,'');const target=normalized(name);const opening=workingOpenings().filter(o=>target.includes(normalized(o.name))||normalized(o.name).includes(target)).sort((a,b)=>b.name.length-a.name.length)[0];state.screen='library';state.level='advanced';state.query=opening?.name||'';if(opening){state.expanded.add(opening.id);const main=opening.lines.find(l=>l.name==='Main line')||opening.lines[0];if(main)state.selected.add(main.id);}save();render();}
function render(){
  const selected=availableDrillLines();
  const due=dueReviewKeys(state.positionStats,selectedPositionKeys()).length;
  let view;
  switch(state.screen){
    case 'dashboard': view=appShell(dashboardView({summary:analysisSummary(),dueMistakes:dueMistakeCount(),selected:selected.length,due}));break;
    case 'practice': view=practiceView({selected:selected.length,due,mistakes:mistakeDeckSummary()},appShell);break;
    case 'analysis': view=appShell(analysisView());break;
    case 'game-review': view=appShell(gameReviewView());break;
    case 'review-practice': view=appShell(reviewPracticeView());break;
    case 'puzzle': view=appShell(puzzleView());break;
    case 'drill': view=drillView();break;
    case 'challenge-play': view=challengeView();break;
    case 'challenge-setup': view=challengeSetupView();break;
    case 'progress': view=progressView();break;
    case 'lessons': view=lessonCatalogView(state,appShell,esc);break;
    case 'lesson': view=lessonDetailView(state,appShell,boardHtml,esc);break;
    default: view=libraryView();
  }
  document.querySelector('#app').innerHTML=view;
}
connectAnalysis({render,studyOpening,navigate:screen=>{if(screen!=='analysis')cancelAnalysisWork();state.screen=screen;render();}});connectReview({render,studyOpening,navigate:screen=>{cancelAnalysisWork();state.screen=screen;render();}});document.addEventListener('click',handleClick);document.addEventListener('change',handleChange);document.addEventListener('input',handleChange);document.addEventListener('submit',e=>{if(e.target.id==='analysis-form')void submitAnalysis(e);if(e.target.id==='review-pgn-form')submitReviewPgn(e);});render();
document.addEventListener('click',e=>{
  const link=e.target.closest('a[target="_blank"]');
  if(link && link.href.startsWith('https://') && window.ChessStudioNative?.postMessage){
    e.preventDefault();
    window.ChessStudioNative.postMessage(JSON.stringify({action:'open',url:link.href}));
  }
},true);
// Called by Android's system Back button. The website's own navigation stays unchanged.
window.chessStudioBack=()=>{
  if(state.screen==='dashboard')return false;
  if(state.screen==='game-review')cancelReviewEngine();
  if(['analysis','puzzle'].includes(state.screen))cancelAnalysisWork();
  const next={lesson:'lessons',drill:'practice','challenge-play':'challenge-setup','challenge-setup':'practice',puzzle:'analysis','review-practice':'practice','game-review':'analysis'};
  state.screen=next[state.screen]||'dashboard';
  state.session=null;state.challenge=null;state.selectedSquare=null;state.pendingOutOfBook=null;
  render();return true;
};

function libraryView(){
  const catalog=levelCatalog(),selected=availableDrillLines();
  const visible=visibleOpenings();
  return appShell(`<main class="page openings-page">
    <header class="openings-intro"><div><p class="eyebrow">YOUR REPERTOIRE</p><h1>Openings</h1><p>Learn a plan, choose your lines, then practice the key moves.</p></div><div class="openings-intro-actions"><button class="secondary" data-action="lessons">Guided lessons →</button><button class="primary" data-action="start" ${selected.length?'':'disabled'}>Drill ${selected.length} ${selected.length===1?'line':'lines'} →</button></div></header>
    <section class="opening-level" aria-label="Library level"><span>Show openings for</span><div class="level-switch">${['beginner','intermediate','advanced'].map(x=>`<button class="${state.level===x?'active':''}" data-action="level" data-id="${x}" aria-pressed="${state.level===x}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}</div></section>
    <details class="opening-secondary"><summary>Drill settings</summary><div class="opening-settings"><label>Practice side<select id="side"><option value="repertoire">Line repertoire side</option><option value="white" ${state.side==='white'?'selected':''}>White only</option><option value="black" ${state.side==='black'?'selected':''}>Black only</option></select></label><label>Recall clock<select id="timer"><option value="0">Untimed</option><option value="15" ${state.timerSeconds===15?'selected':''}>15 seconds</option><option value="5" ${state.timerSeconds===5?'selected':''}>5 seconds</option><option value="2" ${state.timerSeconds===2?'selected':''}>2 seconds</option></select></label></div></details>
    <section class="library"><div class="section-heading"><div><p class="eyebrow">${catalog.length} FAMILIES · ${catalog.reduce((n,o)=>n+o.lines.length,0).toLocaleString()} LINES</p><h2>Choose lines to practice</h2></div><div class="selection-actions"><button data-action="select-visible">Select level</button><button data-action="clear">Clear</button></div></div>
      <div class="catalog-tools"><label class="catalog-search"><span>⌕</span><input id="catalog-search" value="${esc(state.query)}" placeholder="Search openings, variations, or ECO…"></label><select id="focus" aria-label="Filter by side"><option value="all">All openings</option><option value="white" ${state.focus==='white'?'selected':''}>White repertoire</option><option value="black" ${state.focus==='black'?'selected':''}>Black repertoire</option></select><select id="sort" aria-label="Sort openings"><option value="eco">ECO order</option><option value="name" ${state.sort==='name'?'selected':''}>Name A–Z</option><option value="lines" ${state.sort==='lines'?'selected':''}>Most variations</option></select><button class="short-lines-toggle ${state.showShortLines?'active':''}" data-action="toggle-short"><span>${state.showShortLines?'✓':''}</span> Show lines under 4 moves</button></div>
      <p class="catalog-result-count" id="catalog-result-count" role="status">${visible.length} ${visible.length===1?'opening':'openings'} shown</p>
      <div class="opening-list">${visible.map(openingCard).join('')||'<div class="no-results">No openings match those filters.</div>'}</div>
    </section>
    <details class="opening-secondary"><summary>Suggested openings</summary>${recommendationsView()}</details>
  </main>`);
}

function visibleOpenings(){
  let visible=levelCatalog().filter(o=>state.focus==='all'||o.color===state.focus);
  const query=state.query.trim().toLowerCase();
  if(query)visible=visible.filter(o=>`${o.name} ${o.eco} ${o.lines.map(l=>l.name).join(' ')}`.toLowerCase().includes(query));
  return visible.sort((a,b)=>state.sort==='name'?a.name.localeCompare(b.name):state.sort==='lines'?b.lines.length-a.lines.length:a.eco.localeCompare(b.eco)||a.name.localeCompare(b.name));
}

function updateOpeningResults(){
  const visible=visibleOpenings();
  const list=document.querySelector('.opening-list');
  const count=document.querySelector('#catalog-result-count');
  if(list)list.innerHTML=visible.map(openingCard).join('')||'<div class="no-results">No openings match those filters.</div>';
  if(count)count.textContent=`${visible.length} ${visible.length===1?'opening':'openings'} shown`;
}

function progressView(){
  const deck=mistakeDeckSummary();
  const selected=workingLines().filter(l=>state.selected.has(l.id));
  const coverage=coverageForLines(selected,theoryIndex,state.positionStats);
  const due=dueReviewKeys(state.positionStats,selectedPositionKeys()).length;
  const learned=Object.keys(state.lessonCompleted).length;
  const families=workingOpenings().map(o=>({o,lines:o.lines.filter(l=>state.selected.has(l.id))}))
    .filter(x=>x.lines.length).map(x=>({...x,c:coverageForLines(x.lines,theoryIndex,state.positionStats)}))
    .sort((a,b)=>a.c.mastery-b.c.mastery);
  return appShell(`<main class="page progress-page"><p class="eyebrow">YOUR STUDY RECORD</p><h1>Progress</h1>
    <section class="stat-grid"><div><span>${coverage.practiced}/${coverage.positions}</span><small>opening positions seen</small></div><div><span>${due}</span><small>opening positions due</small></div><div><span>${coverage.mastery}%</span><small>estimated mastery</small></div></section>
    <div class="progress-summary"><span>${learned}/${OPENING_LESSONS.length} lessons learned</span><span>${deck.total} game positions saved · ${deck.due} due</span><button class="text-button" data-action="practice">Go to practice →</button></div>
    <details class="opening-secondary progress-tools" ${state.progressImportOpen?'open':''}><summary>Import, export, and reset</summary><div class="progress-actions"><button class="secondary" data-action="export-pgn">Export selected PGN</button><button class="secondary" data-action="export-data">Back up progress</button><label class="secondary file-button">Import PGN / backup<input id="import-file" type="file" accept=".pgn,.json,text/plain"></label><button class="secondary" data-action="reset-stats">Reset practice stats</button></div><p>Your backup includes selected lines, lessons, opening reviews, and game puzzles.</p>${state.importNotice?`<p class="import-notice" role="status">${esc(state.importNotice)}</p>`:''}</details>
    <section class="progress-list"><div class="section-heading"><h2>Repertoire coverage</h2><button class="text-button" data-action="home">Choose openings →</button></div>${families.length?families.map(({o,lines,c})=>`<div class="coverage-row"><span><b>${esc(o.name)}</b><small>${lines.length} selected lines · ${c.practiced}/${c.positions} positions seen · ${c.due} due</small></span><div class="mastery"><i style="width:${c.mastery}%"></i></div><strong>${c.mastery}%</strong></div>`).join(''):'<div class="empty"><h3>No repertoire selected yet</h3><p>Choose an opening to start building your coverage map.</p><button class="primary" data-action="home">Choose openings →</button></div>'}</section>
  </main>`);
}
