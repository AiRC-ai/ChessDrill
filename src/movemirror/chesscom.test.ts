import { expect, it } from 'vitest';
import { normalizeUsername, validChessComApiUrl } from './chesscom';
import { normalizeLichessUsername } from './lichess';

it('rejects third-party, redirected, or cross-account Chess.com archive URLs', () => {
  expect(validChessComApiUrl('https://api.chess.com/pub/player/hikaru/games/2026/09','hikaru')).toBe(true);
  for (const url of [
    'https://api.chess.com.evil.test/pub/player/hikaru/games/2026/09',
    'https://api.chess.com@evil.test/pub/player/hikaru/games/2026/09',
    'http://api.chess.com/pub/player/hikaru',
    'https://api.chess.com/pub/player/hikaru/games/2026/13',
    'https://api.chess.com/pub/player/hikaru/games/2026/09?callback=evil',
    'https://api.chess.com/pub/player/other/games/2026/09',
  ]) expect(validChessComApiUrl(url,'hikaru')).toBe(false);
});

it('handles malformed percent escapes without crashing the account form', () => {
  expect(normalizeUsername('%invalid')).toBe('%invalid');
  expect(normalizeLichessUsername('%invalid')).toBe('%invalid');
});
