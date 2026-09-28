import { expect, it } from 'vitest';
import { clockExpired, remainingSeconds } from './drill-clock.js';

it('counts down to zero at the deadline and leaves untimed drills alone', () => {
  expect(remainingSeconds(2, 1000, 1999)).toBe(2);
  expect(remainingSeconds(2, 1000, 2000)).toBe(1);
  expect(remainingSeconds(2, 1000, 3000)).toBe(0);
  expect(clockExpired(2, 1000, 2999)).toBe(false);
  expect(clockExpired(2, 1000, 3000)).toBe(true);
  expect(clockExpired(0, 1000, 8000)).toBe(false);
});
