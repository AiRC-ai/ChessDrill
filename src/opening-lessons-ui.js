import { OPENING_LESSONS, lessonPosition, matchingLessonLine } from './opening-lessons.js';

const moveLabel = (index, san) => `${Math.floor(index / 2) + 1}${index % 2 ? '...' : '.'} ${san}`;

export function lessonCatalogView(state, appShell, esc) {
  const done = OPENING_LESSONS.filter(lesson => state.lessonCompleted[lesson.id]).length;
  const visible = OPENING_LESSONS.filter(lesson => state.lessonFilter === 'all' || lesson.color === state.lessonFilter);
  return appShell(`<main class="page lessons-page">
    <section class="lesson-hero"><div><p class="eyebrow">GUIDED OPENING LESSONS</p><h1>Learn the idea.<br><em>Remember the move.</em></h1><p>Walk through a real opening position, see why each move matters, then answer two recall questions before drilling the line.</p></div><div class="lesson-hero-progress"><strong>${done}/${OPENING_LESSONS.length}</strong><span>lessons learned</span><div class="progress-track"><i style="width:${done / OPENING_LESSONS.length * 100}%"></i></div><small>Progress is saved on this device.</small></div></section>
    <section class="lesson-principles" aria-label="Opening fundamentals">
      <article><span>01</span><h2>Claim the center</h2><p>Control central squares with pawns and pieces. This gives your pieces room to work.</p></article>
      <article><span>02</span><h2>Develop with purpose</h2><p>Bring out knights and bishops while noticing what your opponent threatens.</p></article>
      <article><span>03</span><h2>Protect your king</h2><p>Castle when it is safe, then connect your rooks before opening the position.</p></article>
      <article><span>04</span><h2>Time the pawn break</h2><p>A pawn break challenges a fixed center. Prepare it with pieces instead of pushing by habit.</p></article>
    </section>
    <section class="lesson-catalog"><div class="section-heading"><div><p class="eyebrow">CHOOSE A STARTING POINT</p><h2>Opening paths</h2></div><p>Each lesson follows one illustrative line; opponents can choose other moves.</p></div>
      <div class="lesson-filters" role="group" aria-label="Filter lessons by side">${[['all','All lessons'],['white','Play as White'],['black','Play as Black']].map(([value,label])=>`<button class="${state.lessonFilter===value?'active':''}" data-action="lesson-filter" data-id="${value}" aria-pressed="${state.lessonFilter===value}">${label}</button>`).join('')}</div>
      <div class="lesson-grid">${visible.map(lesson=>`<article class="lesson-card">
        <div class="lesson-card-meta"><span class="color-dot ${lesson.color}">${lesson.color==='white'?'W':'B'}</span><span>${esc(lesson.level)} · ${esc(lesson.color)} side</span><span class="lesson-done">${state.lessonCompleted[lesson.id]?'✓ Learned':'~ 5 min'}</span></div>
        <h3>${esc(lesson.name)}</h3><p>${esc(lesson.tagline)}</p><div class="lesson-card-foot"><span>${lesson.moves.length} guided moves · 2 recall checks</span><button data-action="open-lesson" data-id="${lesson.id}">${state.lessonCompleted[lesson.id]?'Review lesson':'Start lesson'} →</button></div>
      </article>`).join('')}</div>
    </section>
  </main>`);
}

export function lessonDetailView(state, appShell, boardHtml, esc) {
  const session = state.lesson;
  const lesson = OPENING_LESSONS.find(item => item.id === session?.id);
  if (!lesson) return lessonCatalogView(state, appShell, esc);
  const quiz = lesson.quizzes[session.quiz];
  const ply = session.mode === 'study' ? session.step : session.mode === 'quiz' ? quiz.at + (session.answered ? 1 : 0) : lesson.moves.length;
  const chess = lessonPosition(lesson, ply);
  const step = session.step;
  const current = lesson.moves[step - 1];
  const study = session.mode === 'study';
  const heading = study ? (step ? moveLabel(step - 1, current[0]) : 'The game plan') : session.mode === 'quiz' ? `Recall ${session.quiz + 1} of ${lesson.quizzes.length}` : 'Lesson complete';
  const detail = study ? `<div class="lesson-step">
      <p class="eyebrow">${step ? (step % 2 ? 'WHITE PLAYS' : 'BLACK REPLIES') : 'BEFORE THE FIRST MOVE'}</p><h2>${esc(heading)}</h2><p>${esc(step ? current[1] : lesson.goal)}</p>
      ${step===0?`<div class="lesson-why"><b>What to watch for</b><p>${esc(lesson.watch)}</p></div>`:''}
      <div class="lesson-step-actions"><button class="secondary" data-action="lesson-prev" ${step===0?'disabled':''}>← Previous</button><button class="primary" data-action="lesson-next">${step===lesson.moves.length?'Test your recall →':'Next move →'}</button></div>
    </div>` : session.mode === 'quiz' ? `<div class="lesson-step lesson-quiz">
      <p class="eyebrow">YOUR TURN · ${lesson.color.toUpperCase()}</p><h2>${esc(heading)}</h2><p>${esc(quiz.prompt)}</p>
      <div class="lesson-options" role="group" aria-label="Choose a move">${quiz.options.map(san=>`<button data-action="lesson-answer" data-id="${esc(san)}" ${session.answered?'disabled':''} class="${session.answered&&san===lesson.moves[quiz.at][0]?'correct':''}">${esc(san)}</button>`).join('')}</div>
      <div class="lesson-feedback ${session.answered?'correct':session.feedback?'retry':''}" role="status" aria-live="polite">${esc(session.feedback || 'Choose a move that serves the plan. The board shows the position before your decision.')}</div>
      ${session.answered?`<button class="primary" data-action="lesson-quiz-next">${session.quiz===lesson.quizzes.length-1?'Finish lesson →':'Next question →'}</button>`:''}
    </div>` : `<div class="lesson-step lesson-finish">
      <span class="lesson-finish-icon">✓</span><p class="eyebrow">PLAN → RECALL → PRACTICE</p><h2>You know the idea.</h2><p>You found the key moves in this ${esc(lesson.name)} setup. Now practice the same opening against the repertoire and learn how it changes when the opponent chooses another line.</p>
      <div class="lesson-step-actions"><button class="primary" data-action="lesson-drill">Drill this line →</button><button class="secondary" data-action="lesson-browse">Explore variations</button></div>
      <button class="text-button" data-action="lesson-restart">Replay lesson from the start</button>
    </div>`;
  return appShell(`<main class="page lesson-detail">
    <div class="lesson-top"><button class="back" data-action="lessons">← All lessons</button><span class="eyebrow">${esc(lesson.level.toUpperCase())} · ${lesson.color.toUpperCase()} REPERTOIRE</span></div>
    <div class="lesson-title"><div><p class="eyebrow">OPENING FIELD GUIDE</p><h1>${esc(lesson.name)}</h1><p>${esc(lesson.tagline)}</p></div><span>${session.mode==='study'?`${step}/${lesson.moves.length} moves`:session.mode==='quiz'?`${session.quiz+1}/${lesson.quizzes.length} questions`:'✓ Learned'}</span></div>
    <div class="lesson-layout"><div class="lesson-board-column">${boardHtml(chess,lesson.color)}<p class="lesson-board-caption">${session.mode==='quiz'&&!session.answered?'Position before your move':step ? `After ${esc(moveLabel(step-1,lesson.moves[step-1][0]))}` : 'Starting position'} · Board viewed from ${lesson.color}'s side</p></div>
      <div class="lesson-guide">${detail}<div class="lesson-plan"><p class="eyebrow">KEEP THE IDEAS IN MIND</p><dl><dt>Plan</dt><dd>${esc(lesson.plan)}</dd><dt>Pawn break</dt><dd>${esc(lesson.break)}</dd><dt>Watch for</dt><dd>${esc(lesson.watch)}</dd></dl></div></div>
    </div>
    ${study?`<section class="lesson-sequence"><div class="section-heading"><div><p class="eyebrow">FOLLOW THE LINE</p><h2>Move by move</h2></div><p>Select any move to revisit its reason.</p></div><div class="lesson-moves"><button data-action="lesson-step" data-id="0" class="${step===0?'active':''}">Start</button>${lesson.moves.map(([san],index)=>`<button data-action="lesson-step" data-id="${index+1}" class="${step===index+1?'active':''}">${esc(moveLabel(index,san))}</button>`).join('')}</div><p>This is one instructive continuation, not a forced sequence. Use the plan when your opponent deviates.</p></section>`:''}
  </main>`);
}

export function handleLessonAction({ action, id }, { state, render, save, startSession, openings }) {
  if (action === 'lessons') {
    state.screen = 'lessons';
    state.session = null;
    state.challenge = null;
    render();
    window.scrollTo(0, 0);
    return true;
  }
  if (action === 'lesson-filter') {
    if (['all','white','black'].includes(id)) state.lessonFilter = id;
  } else if (action === 'open-lesson') {
    if (!OPENING_LESSONS.some(lesson => lesson.id === id)) return true;
    state.lesson = { id, mode:'study', step:0, quiz:0, answered:false, feedback:'' };
    state.screen = 'lesson';
    state.session = null;
    state.challenge = null;
    state.selectedSquare = null;
    window.scrollTo(0, 0);
  } else if (action?.startsWith('lesson-')) {
    const session = state.lesson;
    const lesson = OPENING_LESSONS.find(item => item.id === session?.id);
    if (!lesson) return true;
    if (action === 'lesson-prev' && session.mode === 'study') session.step = Math.max(0, session.step - 1);
    else if (action === 'lesson-next' && session.mode === 'study') {
      if (session.step < lesson.moves.length) session.step += 1;
      else { session.mode = 'quiz'; session.quiz = 0; session.feedback = ''; window.scrollTo(0, 0); }
    } else if (action === 'lesson-step') {
      session.mode = 'study';
      session.step = Math.min(lesson.moves.length, Math.max(0, Number(id) || 0));
    } else if (action === 'lesson-answer' && session.mode === 'quiz' && !session.answered) {
      const question = lesson.quizzes[session.quiz];
      if (!question.options.includes(id)) return true;
      if (id === lesson.moves[question.at][0]) {
        session.answered = true;
        session.feedback = question.explanation;
      } else session.feedback = `Not quite. ${question.hint} Try another move.`;
    } else if (action === 'lesson-quiz-next' && session.mode === 'quiz' && session.answered) {
      if (session.quiz + 1 < lesson.quizzes.length) {
        session.quiz += 1; session.answered = false; session.feedback = '';
      } else {
        session.mode = 'done';
        state.lessonCompleted[lesson.id] = Date.now();
        save();
      }
    } else if (action === 'lesson-restart') {
      state.lesson = { id:lesson.id, mode:'study', step:0, quiz:0, answered:false, feedback:'' };
      window.scrollTo(0, 0);
    } else if (action === 'lesson-drill') {
      const line = matchingLessonLine(lesson, openings());
      if (line) {
        state.selected.add(line.id);
        save();
        startSession(false, line);
      } else {
        session.feedback = 'That line is not available in the current repertoire.';
        render();
      }
      return true;
    } else if (action === 'lesson-browse') {
      const opening = openings().find(item => item.id === lesson.openingId);
      state.screen = 'library';
      state.level = 'advanced';
      state.query = opening?.name || '';
      if (opening) state.expanded.add(opening.id);
      save();
      render();
      window.scrollTo(0, 0);
      return true;
    }
  } else return false;
  render();
  return true;
}
