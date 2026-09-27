# Chess Studio

Chess Studio combines [MoveMirror](https://github.com/leglerisaac/movemirror) and [ChessDrill](https://github.com/leglerisaac/ChessDrill) in one free, browser-based learning space. [Open the live site](https://leglerisaac.github.io/ChessDrill/).

## Learn from a complete loop

1. **Analyze your games:** Enter a public Chess.com or Lichess username, select a format and sample size (10–100 standard games), and review strengths, recurring gaps, game phases, evidence positions, opening results, and three linked puzzle themes. MoveMirror's original game replay and scoring modules power the report. A four-week training plan and a locally saved last report are included.
2. **Check critical moves:** Optionally run Stockfish 19 Lite in your browser over at most 48 decisions from three games. Review mistakes and try the engine-confirmed better moves on an interactive board. The engine never sends positions to Chess Studio.
3. **Learn openings:** ChessDrill retains its 124 opening families and 3,755 selectable lines, repertoire roles, hints, animated board, named plans, PGN import/export, and position-based spaced repetition. Jump from a recurring opening in the game report to its matching repertoire family.
4. **Test your recall:** Theory Challenge chooses a random side and varied documented replies, recognizing transpositions. The Progress screen shows due reviews and coverage, with JSON backup and restore.

The dashboard brings analysis findings, selected lines, due positions, and opening progress together. No account is required. Browser storage holds reports and practice progress on the current device. Clearing this site's browser data removes them; export ChessDrill progress if you want a backup.

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
