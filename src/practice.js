export function practiceView({ selected, due, mistakes }, appShell) {
  return appShell(`<main class="page practice-page">
    <header class="practice-heading"><p class="eyebrow">SHORT, FOCUSED SESSIONS</p><h1>Practice</h1><p>Pick what you want to work on. Your progress is saved automatically.</p></header>
    ${due ? `<section class="practice-due"><div><p class="eyebrow">READY FOR REVIEW</p><h2>${due} opening ${due === 1 ? 'position' : 'positions'} due</h2><p>Recall these moves before they fade.</p></div><button class="primary" data-action="review">Review positions →</button></section>` : ''}
    <section class="practice-options" aria-label="Practice modes">
      <article><span class="practice-symbol" aria-hidden="true">▦</span><h2>Opening drills</h2><p>${selected ? `${selected} selected ${selected === 1 ? 'line' : 'lines'} ready for practice.` : 'Choose a few opening lines to train.'}</p><div><button class="primary" data-action="${selected ? 'start' : 'home'}">${selected ? 'Start a drill' : 'Choose openings'} →</button>${selected ? '<button class="text-button" data-action="home">Edit repertoire</button>' : ''}</div></article>
      <article><span class="practice-symbol" aria-hidden="true">◎</span><h2>Moves from your games</h2><p>${mistakes.due ? `${mistakes.due} saved ${mistakes.due === 1 ? 'position' : 'positions'} ready to solve.` : mistakes.total ? 'Your saved positions are caught up for now.' : 'Review a game to save missed moves as puzzles.'}</p><div><button class="primary" data-action="${mistakes.due ? 'practice-due-mistakes' : 'analyze'}">${mistakes.due ? 'Practice due moves' : 'Review a game'} →</button></div></article>
      <article><span class="practice-symbol" aria-hidden="true">↗</span><h2>Theory challenge</h2><p>Play either color and respond when your opponent chooses a different line.</p><div><button class="primary" data-action="challenge">Start a challenge →</button></div></article>
    </section>
  </main>`);
}
