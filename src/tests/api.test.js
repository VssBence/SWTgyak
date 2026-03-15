/**
 * API Integrációs Tesztek
 * REST végpontok tesztelése supertest-tel
 */

const request = require('supertest');
const createApp = require('../app');
const GameManager = require('../models/GameManager');

describe('REST API', () => {
  let app;
  let gm;

  beforeEach(() => {
    gm = new GameManager();
    app = createApp(gm);
  });

  // ==========================================
  // HEALTH CHECK
  // ==========================================
  describe('GET /api/health', () => {
    test('200-at ad vissza', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.uptime).toBeDefined();
    });
  });

  // ==========================================
  // STATS
  // ==========================================
  describe('GET /api/stats', () => {
    test('üres statisztikát ad ha nincs szoba', async () => {
      const res = await request(app).get('/api/stats');

      expect(res.status).toBe(200);
      expect(res.body.activeRooms).toBe(0);
      expect(res.body.totalPlayers).toBe(0);
    });

    test('helyes statisztikát ad szobákkal', async () => {
      gm.createRoom('Player1', 'socket1');
      gm.createRoom('Player2', 'socket2');

      const res = await request(app).get('/api/stats');

      expect(res.body.activeRooms).toBe(2);
      expect(res.body.waitingRooms).toBe(2);
      expect(res.body.playingRooms).toBe(0);
      expect(res.body.totalPlayers).toBe(2);
    });

    test('megkülönbözteti a waiting és playing szobákat', async () => {
      const { roomId } = gm.createRoom('Player1', 'socket1');
      gm.joinRoom(roomId, 'Player2', 'socket2');
      gm.startGame(roomId);

      gm.createRoom('Player3', 'socket3');

      const res = await request(app).get('/api/stats');

      expect(res.body.activeRooms).toBe(2);
      expect(res.body.waitingRooms).toBe(1);
      expect(res.body.playingRooms).toBe(1);
      expect(res.body.totalPlayers).toBe(3);
    });
  });

  // ==========================================
  // ROOMS
  // ==========================================
  describe('GET /api/rooms/:id', () => {
    test('visszaadja a szoba adatait', async () => {
      const { roomId } = gm.createRoom('TestHost', 'socket1');

      const res = await request(app).get(`/api/rooms/${roomId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(roomId);
      expect(res.body.status).toBe('waiting');
      expect(res.body.playerCount).toBe(1);
      expect(res.body.players[0].name).toBe('TestHost');
    });

    test('404-et ad nem létező szobára', async () => {
      const res = await request(app).get('/api/rooms/XXXXXX');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Szoba nem található.');
    });

    test('kisbetűs kóddal is működik', async () => {
      const { roomId } = gm.createRoom('Host', 'socket1');

      const res = await request(app).get(`/api/rooms/${roomId.toLowerCase()}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(roomId);
    });

    test('mutatja a pontszámokat', async () => {
      const { roomId } = gm.createRoom('Host', 'socket1');
      gm.joinRoom(roomId, 'Guest', 'socket2');

      const res = await request(app).get(`/api/rooms/${roomId}`);

      expect(res.body.players).toHaveLength(2);
      expect(res.body.players[0].score).toBe(0);
      expect(res.body.combinedScore).toBe(0);
    });
  });

  // ==========================================
  // STATIC FILES
  // ==========================================
  describe('Static file serving', () => {
    test('kiszolgálja az index.html-t', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('COOP');
    });

    test('kiszolgálja a CSS fájlt', async () => {
      const res = await request(app).get('/css/style.css');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/css');
    });

    test('kiszolgálja a JS fájlt', async () => {
      const res = await request(app).get('/js/game.js');
      expect(res.status).toBe(200);
    });
  });
});
