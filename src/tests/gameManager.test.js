/**
 * GameManager Unit Tesztek
 * Játéklogika tesztelése izoláltan
 */

const GameManager = require('../models/GameManager');

describe('GameManager', () => {
  let gm;

  beforeEach(() => {
    gm = new GameManager();
  });

  // ==========================================
  // SZOBA KEZELÉS
  // ==========================================
  describe('createRoom()', () => {
    test('szobát hoz létre érvényes adatokkal', () => {
      const { roomId, room } = gm.createRoom('Teszt Játékos', 'socket1');

      expect(roomId).toBeDefined();
      expect(roomId).toHaveLength(6);
      expect(room.status).toBe('waiting');
      expect(room.players).toHaveLength(1);
      expect(room.players[0].name).toBe('Teszt Játékos');
      expect(room.players[0].id).toBe('socket1');
      expect(room.players[0].score).toBe(0);
    });

    test('6 karakteres kódot generál', () => {
      const { roomId } = gm.createRoom('Player', 'socket1');
      expect(roomId).toMatch(/^[A-Z2-9]{6}$/);
    });

    test('több szoba egyidejű létrehozása', () => {
      const r1 = gm.createRoom('Player1', 'socket1');
      const r2 = gm.createRoom('Player2', 'socket2');

      expect(r1.roomId).not.toBe(r2.roomId);
      expect(gm.rooms.size).toBe(2);
    });
  });

  describe('joinRoom()', () => {
    let roomId;

    beforeEach(() => {
      ({ roomId } = gm.createRoom('Host', 'socket1'));
    });

    test('második játékos sikeresen csatlakozik', () => {
      const result = gm.joinRoom(roomId, 'Guest', 'socket2');

      expect(result.error).toBeUndefined();
      expect(result.room.players).toHaveLength(2);
      expect(result.room.players[1].name).toBe('Guest');
    });

    test('hibát ad nem létező szobára', () => {
      const result = gm.joinRoom('XXXXXX', 'Guest', 'socket2');
      expect(result.error).toBe('A szoba nem található.');
    });

    test('hibát ad ha a szoba megtelt', () => {
      gm.joinRoom(roomId, 'Guest', 'socket2');
      const result = gm.joinRoom(roomId, 'Third', 'socket3');
      expect(result.error).toBe('A szoba megtelt.');
    });

    test('hibát ad azonos névre', () => {
      const result = gm.joinRoom(roomId, 'Host', 'socket2');
      expect(result.error).toBe('Ez a név már foglalt ebben a szobában.');
    });

    test('hibát ad ha a játék már elkezdődött', () => {
      gm.joinRoom(roomId, 'Guest', 'socket2');
      gm.startGame(roomId);
      const result = gm.joinRoom(roomId, 'Late', 'socket3');
      expect(result.error).toBe('A játék már elkezdődött.');
    });
  });

  // ==========================================
  // JÁTÉK INDÍTÁS
  // ==========================================
  describe('startGame()', () => {
    let roomId;

    beforeEach(() => {
      ({ roomId } = gm.createRoom('Host', 'socket1'));
    });

    test('hibát ad ha nincs elég játékos', () => {
      const result = gm.startGame(roomId);
      expect(result.error).toBe('Legalább 2 játékos szükséges.');
    });

    test('sikeresen indít ha van 2 játékos', () => {
      gm.joinRoom(roomId, 'Guest', 'socket2');
      const result = gm.startGame(roomId);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe('question');
      expect(result.questionIndex).toBe(1);
      expect(result.question.text).toBeDefined();
      expect(result.question.options).toHaveLength(4);
      expect(result.timeLimit).toBe(20);
    });

    test('a szoba státusza playing-re vált', () => {
      gm.joinRoom(roomId, 'Guest', 'socket2');
      gm.startGame(roomId);

      const room = gm.getRoom(roomId);
      expect(room.status).toBe('playing');
    });

    test('kérdéseket tölt be indításkor', () => {
      gm.joinRoom(roomId, 'Guest', 'socket2');
      gm.startGame(roomId);

      const room = gm.getRoom(roomId);
      expect(room.questions.length).toBeGreaterThan(0);
      expect(room.questions.length).toBeLessThanOrEqual(10);
    });

    test('nem indítható kétszer', () => {
      gm.joinRoom(roomId, 'Guest', 'socket2');
      gm.startGame(roomId);
      const result = gm.startGame(roomId);
      expect(result.error).toBe('A játék már fut.');
    });
  });

  // ==========================================
  // VÁLASZADÁS ÉS PONTOZÁS
  // ==========================================
  describe('submitAnswer()', () => {
    let roomId;

    beforeEach(() => {
      ({ roomId } = gm.createRoom('Host', 'socket1'));
      gm.joinRoom(roomId, 'Guest', 'socket2');
      gm.startGame(roomId);
    });

    test('helyes válasz pontot ad', () => {
      const room = gm.getRoom(roomId);
      const correctIdx = room.currentQuestion.correctIndex;

      const result = gm.submitAnswer(roomId, 'socket1', correctIdx);
      expect(result.isCorrect).toBe(true);
      expect(result.points).toBeGreaterThan(0);
    });

    test('helytelen válasz 0 pontot ad', () => {
      const room = gm.getRoom(roomId);
      const wrongIdx = (room.currentQuestion.correctIndex + 1) % 4;

      const result = gm.submitAnswer(roomId, 'socket1', wrongIdx);
      expect(result.isCorrect).toBe(false);
      expect(result.points).toBe(0);
    });

    test('nem lehet kétszer válaszolni', () => {
      const room = gm.getRoom(roomId);
      const correctIdx = room.currentQuestion.correctIndex;

      gm.submitAnswer(roomId, 'socket1', correctIdx);
      const result = gm.submitAnswer(roomId, 'socket1', correctIdx);
      expect(result.error).toBe('Már válaszoltál erre a kérdésre.');
    });

    test('allAnswered true ha mindketten válaszoltak', () => {
      const room = gm.getRoom(roomId);
      const idx = room.currentQuestion.correctIndex;

      gm.submitAnswer(roomId, 'socket1', idx);
      const result = gm.submitAnswer(roomId, 'socket2', idx);

      expect(result.allAnswered).toBe(true);
      expect(result.players).toBeDefined();
      expect(result.correctIndex).toBeDefined();
    });

    test('allAnswered false ha csak egy válaszolt', () => {
      const room = gm.getRoom(roomId);
      const result = gm.submitAnswer(roomId, 'socket1', 0);
      expect(result.allAnswered).toBe(false);
      expect(result.players).toBeUndefined();
    });

    test('COOP bónusz ha mindketten helyesen válaszolnak', () => {
      const room = gm.getRoom(roomId);
      const correctIdx = room.currentQuestion.correctIndex;

      gm.submitAnswer(roomId, 'socket1', correctIdx);
      const result = gm.submitAnswer(roomId, 'socket2', correctIdx);

      expect(result.coopBonus).toBeGreaterThan(0);
    });

    test('nincs COOP bónusz ha valaki rosszul válaszol', () => {
      const room = gm.getRoom(roomId);
      const correctIdx = room.currentQuestion.correctIndex;
      const wrongIdx = (correctIdx + 1) % 4;

      gm.submitAnswer(roomId, 'socket1', correctIdx);
      const result = gm.submitAnswer(roomId, 'socket2', wrongIdx);

      expect(result.coopBonus).toBe(0);
    });
  });

  // ==========================================
  // PONTSZÁMÍTÁS
  // ==========================================
  describe('Pontszámítás (_calculatePoints)', () => {
    let gm;

    beforeEach(() => {
      gm = new GameManager();
    });

    test('helytelen válasz 0 pont', () => {
      const points = gm._calculatePoints(false, 5, 20, 'easy');
      expect(points).toBe(0);
    });

    test('helyes válasz alap pontot ad', () => {
      const points = gm._calculatePoints(true, 10, 20, 'easy');
      expect(points).toBeGreaterThanOrEqual(100);
    });

    test('gyorsabb válasz több pontot ér', () => {
      const fast = gm._calculatePoints(true, 2, 20, 'easy');
      const slow = gm._calculatePoints(true, 18, 20, 'easy');
      expect(fast).toBeGreaterThan(slow);
    });

    test('nehezebb kérdés szorzót ad', () => {
      const easy = gm._calculatePoints(true, 5, 20, 'easy');
      const hard = gm._calculatePoints(true, 5, 20, 'hard');
      expect(hard).toBeGreaterThan(easy);
    });

    test('medium nehézség 1.5x szorzó', () => {
      const easy = gm._calculatePoints(true, 10, 20, 'easy');
      const medium = gm._calculatePoints(true, 10, 20, 'medium');
      expect(medium).toBe(Math.round(easy * 1.5));
    });
  });

  // ==========================================
  // COOP BÓNUSZ
  // ==========================================
  describe('COOP bónusz (_getCoopBonus)', () => {
    test('easy kérdés 25 bónusz', () => {
      expect(gm._getCoopBonus('easy')).toBe(25);
    });

    test('medium kérdés 50 bónusz', () => {
      expect(gm._getCoopBonus('medium')).toBe(50);
    });

    test('hard kérdés 100 bónusz', () => {
      expect(gm._getCoopBonus('hard')).toBe(100);
    });
  });

  // ==========================================
  // KÖVETKEZŐ KÉRDÉS ÉS JÁTÉK VÉGE
  // ==========================================
  describe('nextQuestion()', () => {
    let roomId;

    beforeEach(() => {
      ({ roomId } = gm.createRoom('Host', 'socket1'));
      gm.joinRoom(roomId, 'Guest', 'socket2');
      gm.startGame(roomId);
    });

    test('új kérdést tölt be', () => {
      const room = gm.getRoom(roomId);
      const firstQuestion = room.currentQuestion.text;

      // Válaszoljunk mindketten
      gm.submitAnswer(roomId, 'socket1', 0);
      gm.submitAnswer(roomId, 'socket2', 0);

      const result = gm.nextQuestion(roomId);

      if (result.status !== 'finished') {
        expect(result.status).toBe('question');
        expect(result.questionIndex).toBe(2);
      }
    });

    test('reset-eli a válaszokat', () => {
      gm.submitAnswer(roomId, 'socket1', 0);
      gm.submitAnswer(roomId, 'socket2', 0);
      gm.nextQuestion(roomId);

      const room = gm.getRoom(roomId);
      room.players.forEach(p => {
        expect(p.answered).toBe(false);
        expect(p.lastAnswer).toBeNull();
      });
    });
  });

  // ==========================================
  // DISCONNECT KEZELÉS
  // ==========================================
  describe('handleDisconnect()', () => {
    test('törli a szobát ha az utolsó játékos távozik', () => {
      const { roomId } = gm.createRoom('Host', 'socket1');
      const result = gm.handleDisconnect('socket1');

      expect(result.roomDeleted).toBe(true);
      expect(gm.rooms.size).toBe(0);
    });

    test('meghagyja a szobát ha van még játékos', () => {
      const { roomId } = gm.createRoom('Host', 'socket1');
      gm.joinRoom(roomId, 'Guest', 'socket2');

      const result = gm.handleDisconnect('socket2');

      expect(result.roomDeleted).toBe(false);
      expect(result.disconnectedPlayer).toBe('Guest');
      expect(gm.rooms.size).toBe(1);
    });

    test('játék közben finished státuszra vált', () => {
      const { roomId } = gm.createRoom('Host', 'socket1');
      gm.joinRoom(roomId, 'Guest', 'socket2');
      gm.startGame(roomId);

      gm.handleDisconnect('socket2');

      const room = gm.getRoom(roomId);
      expect(room.status).toBe('finished');
    });

    test('null-t ad ismeretlen socket-re', () => {
      const result = gm.handleDisconnect('unknown');
      expect(result).toBeNull();
    });
  });

  // ==========================================
  // ÉRTÉKELÉS
  // ==========================================
  describe('Értékelés (_getGrade)', () => {
    test('90%+ legendás', () => {
      const grade = gm._getGrade(900, 1000);
      expect(grade.emoji).toBe('🏆');
    });

    test('70-89% kiváló', () => {
      const grade = gm._getGrade(750, 1000);
      expect(grade.emoji).toBe('⭐');
    });

    test('50-69% jó', () => {
      const grade = gm._getGrade(550, 1000);
      expect(grade.emoji).toBe('👍');
    });

    test('30-49% fejlődni kell', () => {
      const grade = gm._getGrade(350, 1000);
      expect(grade.emoji).toBe('💪');
    });

    test('30% alatt gyakoroljatok', () => {
      const grade = gm._getGrade(100, 1000);
      expect(grade.emoji).toBe('📚');
    });
  });
});
