/**
 * GameManager - A játéklogika kezelése
 * Felelős: szobák kezelése, kérdések, pontszámítás, időzítés
 */

const { v4: uuidv4 } = require('uuid');
const questions = require('./questions');

class GameManager {
  constructor() {
    // Aktív szobák tárolása: roomId -> Room objektum
    this.rooms = new Map();
  }

  /**
   * Új szoba létrehozása
   * @param {string} hostName - A szobát létrehozó játékos neve
   * @param {string} socketId - A host socket ID-ja
   * @returns {object} { roomId, room }
   */
  createRoom(hostName, socketId) {
    const roomId = this._generateRoomCode();
    const room = {
      id: roomId,
      status: 'waiting',     // waiting | playing | finished
      players: [
        { id: socketId, name: hostName, score: 0, answered: false, lastAnswer: null }
      ],
      currentQuestion: null,
      questionIndex: -1,
      questions: [],
      totalQuestions: 10,
      roundStartTime: null,
      timeLimit: 20,          // másodperc kérdésenként
      combinedScore: 0,
      createdAt: Date.now()
    };

    this.rooms.set(roomId, room);
    return { roomId, room };
  }

  /**
   * Csatlakozás meglévő szobához
   * @param {string} roomId - Szoba kód
   * @param {string} playerName - Játékos neve
   * @param {string} socketId - Socket ID
   * @returns {object|null} A szoba objektum, vagy null ha nem sikerült
   */
  joinRoom(roomId, playerName, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'A szoba nem található.' };
    if (room.status !== 'waiting') return { error: 'A játék már elkezdődött.' };
    if (room.players.length >= 2) return { error: 'A szoba megtelt.' };
    if (room.players.some(p => p.name === playerName)) {
      return { error: 'Ez a név már foglalt ebben a szobában.' };
    }

    room.players.push({
      id: socketId,
      name: playerName,
      score: 0,
      answered: false,
      lastAnswer: null
    });

    return { room };
  }

  /**
   * Játék indítása - kérdések keverése és első kérdés
   * @param {string} roomId
   * @returns {object|null}
   */
  startGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Szoba nem található.' };
    if (room.players.length < 2) return { error: 'Legalább 2 játékos szükséges.' };
    if (room.status !== 'waiting') return { error: 'A játék már fut.' };

    room.status = 'playing';
    room.questions = this._selectQuestions(room.totalQuestions);
    
    return this.nextQuestion(roomId);
  }

  /**
   * Következő kérdés betöltése
   * @param {string} roomId
   * @returns {object}
   */
  nextQuestion(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Szoba nem található.' };

    room.questionIndex++;

    if (room.questionIndex >= room.questions.length) {
      return this._finishGame(roomId);
    }

    // Reset válaszok
    room.players.forEach(p => {
      p.answered = false;
      p.lastAnswer = null;
    });

    const q = room.questions[room.questionIndex];
    room.currentQuestion = q;
    room.roundStartTime = Date.now();

    return {
      status: 'question',
      questionIndex: room.questionIndex + 1,
      totalQuestions: room.questions.length,
      question: {
        text: q.text,
        options: q.options,
        category: q.category,
        difficulty: q.difficulty
      },
      timeLimit: room.timeLimit
    };
  }

  /**
   * Válasz feldolgozása
   * @param {string} roomId
   * @param {string} socketId - Válaszoló játékos socket ID
   * @param {number} answerIndex - Választott válasz indexe (0-3)
   * @returns {object}
   */
  submitAnswer(roomId, socketId, answerIndex) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Szoba nem található.' };
    if (room.status !== 'playing') return { error: 'A játék nem fut.' };

    const player = room.players.find(p => p.id === socketId);
    if (!player) return { error: 'Játékos nem található.' };
    if (player.answered) return { error: 'Már válaszoltál erre a kérdésre.' };

    const elapsed = (Date.now() - room.roundStartTime) / 1000;
    const isCorrect = answerIndex === room.currentQuestion.correctIndex;
    const points = this._calculatePoints(isCorrect, elapsed, room.timeLimit, room.currentQuestion.difficulty);

    player.answered = true;
    player.lastAnswer = answerIndex;
    player.score += points;

    // Ellenőrizzük, mindkét játékos válaszolt-e
    const allAnswered = room.players.every(p => p.answered);

    // COOP bónusz: ha mindketten helyesen válaszoltak
    let coopBonus = 0;
    if (allAnswered) {
      const allCorrect = room.players.every(
        p => p.lastAnswer === room.currentQuestion.correctIndex
      );
      if (allCorrect) {
        coopBonus = this._getCoopBonus(room.currentQuestion.difficulty);
        room.players.forEach(p => p.score += coopBonus);
      }

      room.combinedScore = room.players.reduce((sum, p) => sum + p.score, 0);
    }

    return {
      playerId: socketId,
      playerName: player.name,
      isCorrect,
      points,
      allAnswered,
      coopBonus,
      correctIndex: allAnswered ? room.currentQuestion.correctIndex : undefined,
      players: allAnswered ? room.players.map(p => ({
        name: p.name,
        score: p.score,
        lastAnswer: p.lastAnswer,
        wasCorrect: p.lastAnswer === room.currentQuestion.correctIndex
      })) : undefined,
      combinedScore: allAnswered ? room.combinedScore : undefined
    };
  }

  /**
   * Játékos lecsatlakozásának kezelése
   * @param {string} socketId
   * @returns {object|null}
   */
  handleDisconnect(socketId) {
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socketId);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          this.rooms.delete(roomId);
          return { roomId, roomDeleted: true };
        }

        if (room.status === 'playing') {
          room.status = 'finished';
        }

        return {
          roomId,
          roomDeleted: false,
          disconnectedPlayer: player.name,
          remainingPlayers: room.players.map(p => p.name)
        };
      }
    }
    return null;
  }

  /**
   * Szoba lekérdezése
   */
  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  /**
   * Szoba törlése
   */
  deleteRoom(roomId) {
    return this.rooms.delete(roomId);
  }

  // --- Privát metódusok ---

  /**
   * 6 karakteres szobakód generálása
   */
  _generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Kihagyva: I,O,0,1
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ha már létezik, újat generálunk
    if (this.rooms.has(code)) return this._generateRoomCode();
    return code;
  }

  /**
   * Kérdések random kiválasztása
   */
  _selectQuestions(count) {
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * Pontszámítás: helyes válasz + idő bónusz + nehézségi szorzó
   */
  _calculatePoints(isCorrect, elapsedSeconds, timeLimit, difficulty) {
    if (!isCorrect) return 0;

    const basePoints = 100;
    const timeBonus = Math.max(0, Math.round((1 - elapsedSeconds / timeLimit) * 50));
    const difficultyMultiplier = { easy: 1, medium: 1.5, hard: 2 };
    const multiplier = difficultyMultiplier[difficulty] || 1;

    return Math.round((basePoints + timeBonus) * multiplier);
  }

  /**
   * COOP bónusz: mindkét játékos helyes válasza esetén
   */
  _getCoopBonus(difficulty) {
    const bonuses = { easy: 25, medium: 50, hard: 100 };
    return bonuses[difficulty] || 25;
  }

  /**
   * Játék befejezése
   */
  _finishGame(roomId) {
    const room = this.rooms.get(roomId);
    room.status = 'finished';

    const maxPossible = room.questions.reduce((sum, q) => {
      const diffMultiplier = { easy: 1, medium: 1.5, hard: 2 };
      return sum + (150 * (diffMultiplier[q.difficulty] || 1));
    }, 0) * 2; // 2 játékos

    return {
      status: 'finished',
      players: room.players.map(p => ({
        name: p.name,
        score: p.score
      })),
      combinedScore: room.combinedScore,
      maxPossible: Math.round(maxPossible),
      grade: this._getGrade(room.combinedScore, maxPossible)
    };
  }

  /**
   * Csapat értékelés az összpontszám alapján
   */
  _getGrade(score, maxPossible) {
    const percentage = (score / maxPossible) * 100;
    if (percentage >= 90) return { emoji: '🏆', text: 'Legendás csapat!' };
    if (percentage >= 70) return { emoji: '⭐', text: 'Kiváló együttműködés!' };
    if (percentage >= 50) return { emoji: '👍', text: 'Jó munka, csapat!' };
    if (percentage >= 30) return { emoji: '💪', text: 'Van hova fejlődni!' };
    return { emoji: '📚', text: 'Gyakoroljatok még együtt!' };
  }
}

module.exports = GameManager;
