import { Chess } from 'chess.js';
import { afterEach, expect, it, vi } from 'vitest';
import { connectReview, exportMistakeDeck, handleReviewAction, restoreMistakeDeck, reviewPracticeView, startDueMistakes } from './review.js';
import { analysis, connectAnalysis, handleAnalysisAction, puzzleView } from './analysis.js';

const board = new Chess();
board.move('f3');
board.move('e5');
const fen = board.fen();

afterEach(() => { restoreMistakeDeck([]); analysis.report = null; vi.unstubAllGlobals(); });

it('explains a saved game puzzle after reveal and keeps older cards usable', () => {
  vi.stubGlobal('localStorage', {setItem:vi.fn(),getItem:vi.fn()});
  connectReview({render:vi.fn(),navigate:vi.fn(),studyOpening:vi.fn()});
  restoreMistakeDeck([{id:'legacy#2',fen,bestMove:'e2e3',bestSan:'e3',playedSan:'g4',
    opponent:'Opponent',color:'w',phase:'Opening',gameId:'legacy',moveNumber:2,
    loss:2000,mateThreat:true,due:Date.now()-1,streak:0,attempts:0}]);
  expect(exportMistakeDeck()[0].bestLine).toEqual(['e3']);
  startDueMistakes();
  expect(reviewPracticeView()).not.toContain('WHY THE ENGINE PREFERS IT');
  handleReviewAction({dataset:{action:'review-reveal'}});
  expect(reviewPracticeView()).toContain('WHY THE ENGINE PREFERS IT');
  expect(reviewPracticeView()).toContain('Qh4# was checkmate');
  expect(reviewPracticeView()).toContain('legal answer to the check is g3');
  expect(reviewPracticeView()).toContain('After e3');
  handleReviewAction({dataset:{action:'review-line-step',index:'0'}});
  expect(reviewPracticeView()).toContain('Starting position · illustrative engine line');
});

it('explains a MoveMirror engine puzzle and replays its saved continuation', () => {
  const moment = {
    fen, color:'White',opening:'King Pawn Game',phase:'Opening',opponent:'Opponent',
    playedMove:'g4',bestMove:'e2e3',bestMoveSan:'e3',
    bestLine:['e3','Qh4+','g3'],punishmentMove:'d8h4',punishmentMoveSan:'Qh4#',
    centipawnLoss:2000,category:'Checkmate Patterns',reason:'The move allowed a forcing mate.',
    gameUrl:'https://www.chess.com/game/live/123',
  };
  analysis.report = {engineAnalysis:{depth:9,criticalMoments:[moment]}};
  connectAnalysis({render:vi.fn(),navigate:vi.fn(),studyOpening:vi.fn()});
  handleAnalysisAction({dataset:{action:'train-moments'}});
  expect(puzzleView()).not.toContain('WHY THE ENGINE PREFERS IT');
  handleAnalysisAction({dataset:{action:'reveal-moment'}});
  const html = puzzleView();
  expect(html).toContain('WHY THE ENGINE PREFERS IT');
  expect(html).toContain('Qh4# was checkmate');
  expect(html).toContain('After e3');
  expect(html).toContain('data-index="3"');
  handleAnalysisAction({dataset:{action:'moment-line-step',index:'3'}});
  expect(puzzleView()).toContain('After g3');
  handleAnalysisAction({dataset:{action:'moment-line-step',index:'0'}});
  expect(puzzleView()).toContain('Starting position · illustrative engine line');
});
