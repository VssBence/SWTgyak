/**
 * Kérdésbank Tesztek
 * A kérdések formátumának és tartalmának validálása
 */

const questions = require('../models/questions');

describe('Kérdésbank', () => {

  test('legalább 20 kérdés van', () => {
    expect(questions.length).toBeGreaterThanOrEqual(20);
  });

  test('minden kérdésnek van text mezője', () => {
    questions.forEach((q, i) => {
      expect(q.text).toBeDefined();
      expect(typeof q.text).toBe('string');
      expect(q.text.length).toBeGreaterThan(0);
    });
  });

  test('minden kérdésnek pontosan 4 válaszlehetősége van', () => {
    questions.forEach((q, i) => {
      expect(q.options).toBeDefined();
      expect(q.options).toHaveLength(4);
    });
  });

  test('correctIndex 0-3 közötti szám', () => {
    questions.forEach((q, i) => {
      expect(q.correctIndex).toBeDefined();
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThanOrEqual(3);
      expect(Number.isInteger(q.correctIndex)).toBe(true);
    });
  });

  test('minden kérdésnek van kategóriája', () => {
    const validCategories = ['Tudomány', 'Történelem', 'Informatika', 'Földrajz', 'Kultúra'];
    questions.forEach((q, i) => {
      expect(validCategories).toContain(q.category);
    });
  });

  test('minden kérdésnek van nehézségi szintje', () => {
    const validDifficulties = ['easy', 'medium', 'hard'];
    questions.forEach((q, i) => {
      expect(validDifficulties).toContain(q.difficulty);
    });
  });

  test('van mindhárom nehézségi szintből', () => {
    const difficulties = new Set(questions.map(q => q.difficulty));
    expect(difficulties.has('easy')).toBe(true);
    expect(difficulties.has('medium')).toBe(true);
    expect(difficulties.has('hard')).toBe(true);
  });

  test('nincs duplikált kérdés', () => {
    const texts = questions.map(q => q.text);
    const uniqueTexts = new Set(texts);
    expect(uniqueTexts.size).toBe(texts.length);
  });

  test('a válaszlehetőségek nem üresek', () => {
    questions.forEach((q, i) => {
      q.options.forEach((opt, j) => {
        expect(typeof opt).toBe('string');
        expect(opt.length).toBeGreaterThan(0);
      });
    });
  });

  test('legalább 3 különböző kategória van', () => {
    const categories = new Set(questions.map(q => q.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });
});
