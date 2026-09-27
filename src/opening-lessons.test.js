import { describe, expect, it } from 'vitest';
import { OPENINGS } from './openings.js';
import { OPENING_LESSONS, lessonPosition, matchingLessonLine } from './opening-lessons.js';

describe('guided opening lessons', () => {
  it('teaches legal lines and asks legal, side-correct recall questions', () => {
    expect(OPENING_LESSONS.length).toBeGreaterThanOrEqual(8);
    for (const lesson of OPENING_LESSONS) {
      const chess = lessonPosition(lesson, lesson.moves.length);
      expect(chess.history()).toEqual(lesson.moves.map(([san]) => san));
      expect(lesson.quizzes).toHaveLength(2);
      for (const quiz of lesson.quizzes) {
        const position = lessonPosition(lesson, quiz.at);
        const correct = lesson.moves[quiz.at][0];
        expect(position.turn()).toBe(lesson.color === 'white' ? 'w' : 'b');
        expect(quiz.options).toContain(correct);
        expect(new Set(quiz.options).size).toBe(quiz.options.length);
        for (const move of quiz.options) expect(position.moves()).toContain(move);
      }
    }
  });

  it('hands every lesson to the same opening line in the repertoire', () => {
    for (const lesson of OPENING_LESSONS) {
      const line = matchingLessonLine(lesson, OPENINGS);
      expect(line, lesson.name).not.toBeNull();
      expect(line.repertoireColor).toBe(lesson.color);
      expect(line.moves.slice(0, lesson.moves.length)).toEqual(lesson.moves.map(([san]) => san));
    }
  });
});
