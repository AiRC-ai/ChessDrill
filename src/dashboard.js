const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function dashboardView({summary, selected, due, dueMistakes}) {
  const next = dueMistakes ? {
    title: 'Practice a move from your games',
    detail: `${dueMistakes} saved ${dueMistakes === 1 ? 'position is' : 'positions are'} ready for review.`,
    action: 'practice-due-mistakes', label: 'Practice game positions',
  } : due ? {
    title: 'Review your opening positions',
    detail: `${due} ${due === 1 ? 'position is' : 'positions are'} due today.`,
    action: 'review', label: 'Review due positions',
  } : selected ? {
    title: 'Keep your repertoire fresh',
    detail: `${selected} selected ${selected === 1 ? 'line is' : 'lines are'} ready for a short drill.`,
    action: 'start', label: 'Start an opening drill',
  } : {
    title: 'Start with one opening',
    detail: 'Learn the plan, then practice the key moves.',
    action: 'lessons', label: 'Explore opening lessons',
  };
  return `<main class="studio-home">
    <section class="home-intro"><p class="eyebrow">CHESS STUDIO</p><h1>Your next move.</h1><p>Review your games, learn an opening, or practice what you missed.</p></section>
    <section class="home-next" aria-label="Suggested next step"><div><p class="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>${next.title}</h2><p>${next.detail}</p></div><button class="primary" data-action="${next.action}">${next.label} →</button></section>
    <section class="home-actions" aria-label="Choose a study area">
      <button class="home-card" data-action="analyze"><span class="home-card-icon" aria-hidden="true">♟</span><span><b>Review games</b><small>Analyze an account or import a PGN.</small></span><span class="home-card-arrow" aria-hidden="true">→</span></button>
      <button class="home-card" data-action="home"><span class="home-card-icon" aria-hidden="true">▦</span><span><b>Learn openings</b><small>Study plans and choose repertoire lines.</small></span><span class="home-card-arrow" aria-hidden="true">→</span></button>
      <button class="home-card" data-action="practice"><span class="home-card-icon" aria-hidden="true">↗</span><span><b>Practice</b><small>Drill openings, mistakes, and theory.</small></span><span class="home-card-arrow" aria-hidden="true">→</span></button>
    </section>
    ${summary ? `<p class="home-recent">Last game analysis: <button data-action="analyze">@${esc(summary.username)} · ${esc(summary.games)} games →</button></p>` : ''}
  </main>`;
}
