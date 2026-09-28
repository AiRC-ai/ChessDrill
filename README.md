# Chess Studio

Chess Studio combines [MoveMirror](https://github.com/leglerisaac/movemirror) and [ChessDrill](https://github.com/leglerisaac/ChessDrill) in one free, browser-based learning space. [Open the live site](https://leglerisaac.github.io/ChessDrill/).

## Learn from a complete loop

1. **Analyze your games:** Enter a public Chess.com or Lichess username, select a format and sample size (10–100 standard games), and review strengths, recurring gaps, game phases, evidence positions, opening results, and three linked puzzle themes. MoveMirror's original game replay and scoring modules power the report. A four-week training plan and a locally saved last report are included.
2. **Check critical moves:** Optionally run Stockfish 19 Lite in your browser over at most 48 decisions from three games. Review mistakes and try the engine-confirmed better moves on an interactive board. After solving or revealing a position, see why the move works and step through the suggested continuation. The engine never sends positions to Chess Studio.
3. **Review a whole game:** Choose any of the eight recent games in your report, or paste one standard-chess PGN and choose your side. Replay both players' moves, then run an on-demand engine pass with a choice of search depths. Each checked move explains a concrete idea on the board, compares your move with the suggested move, and offers a question to use in future games. The review covers up to the first 160 half-moves of a long game; the rest remain available for replay. Download an annotated PGN with the explanations to study elsewhere.
4. **Practice your own misses:** Save missed moves from the review as interactive puzzles. Solve them from the original position, ask for hints when needed, and revisit them on a growing schedule. After each puzzle, see a position-based explanation and replay the engine line. Older saved puzzles can still show legal-move explanations and recover immediate mating replies when possible. Your dashboard and Progress page surface due positions.
5. **Understand opening plans:** The Learn section has eight guided lessons for the Italian, Ruy Lopez, Queen's Gambit Declined, London, Sicilian, French, Caro-Kann, and King's Indian. Each shows the moves on a board, explains the purpose of every move, highlights the plan and pawn break, and asks two legal-move recall questions. A completed lesson can start a drill on its matching repertoire line or open that opening's variations. Lessons are introductory paths, not a promise that the opponent will follow a fixed sequence.
6. **Build a repertoire:** ChessDrill retains its 124 opening families and 3,755 selectable lines, repertoire roles, hints, animated board, named plans, PGN import/export, and position-based spaced repetition. Jump from a recurring opening in the game report to its matching repertoire family.
7. **Test your recall:** Theory Challenge chooses a random side and varied documented replies, recognizing transpositions. The Progress screen shows due reviews, guided lessons, and coverage, with JSON backup and restore for your repertoire, lesson completion, and personal game puzzles.

The dashboard brings analysis findings, selected lines, due positions, and opening progress together. No account is required. Browser storage holds reports, up to eight recent sample PGNs, three engine game reviews, and at most 120 personal practice positions on the current device. Clearing this site's browser data removes them. The Progress JSON backup covers repertoire and game puzzles; annotated PGN exports cover an individual game review. Imported backups are validated before replacing study data. Engine evaluations at depth 8–12 are estimates and close classifications can change on a deeper pass.

## Android app

The `android/` project packages Chess Studio and its local Stockfish engine as an installable Android app. The lessons, drills, puzzle deck, and PGN review work offline; public-account analysis needs a connection. The Android build workflow produces an APK. [Android build and transfer instructions](android/README.md) explain how to move a Progress JSON backup from the website into the app. Website and app storage are separate.

## Local development

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

To verify and build a project Pages artifact:

```bash
npm test
npm run test:analysis
npm run build -- --base=/ChessDrill/
```

The bundled smoke test exercises both public-game adapters and their report, plan, and engine-summary handoff using deterministic games. `predev` and `prebuild` copy the browser's Stockfish worker, WebAssembly file, and GPLv3 license from the `stockfish` dependency into `public/stockfish/`. The generated files are ignored in git and included in the deployed artifact.

## Deployment

The Pages workflow tests and builds after a push to `main`. Set the repository's Pages source to **GitHub Actions**. Asset URLs use the repository prefix so the worker, board pieces, and bundle resolve from `/ChessDrill/`.

This is the free static learning site. MoveMirror's separate Cloudflare Worker, D1, Stripe checkout, coach roster, and scheduled email features require a backend and are not deployed through GitHub Pages. See [MoveMirror's deployment guide](https://github.com/leglerisaac/movemirror/blob/main/DEPLOYMENT.md) for that product.

## Data and attribution

- Opening records are generated from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0); `src/openings.js` contains the bundled catalog.
- `src/movemirror/` contains adapted analysis, public API adapters, report planning, and engine insight modules from the owner's MoveMirror project.
- Stockfish 19 Lite runs locally under GPLv3; its `Copying.txt` ships next to the engine assets.
- Game data comes from the public Chess.com and Lichess APIs. Chess Studio is independent and is not endorsed by either platform.
- Chess.com API responses use direct requests when available. The JSONP fallback runs inside an isolated, opaque-origin iframe so third-party scripts cannot read the app's saved study data or Android bridge.
