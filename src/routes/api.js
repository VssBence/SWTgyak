/**
 * API Routes - REST végpontok
 * GET /api/rooms/:id - Szoba információ lekérdezése
 * GET /api/health - Health check
 * GET /api/stats - Szerver statisztikák
 */

const express = require('express');

module.exports = function(gameManager) {
  const router = express.Router();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Szerver statisztikák
  router.get('/stats', (req, res) => {
    const rooms = gameManager.rooms;
    const stats = {
      activeRooms: rooms.size,
      waitingRooms: [...rooms.values()].filter(r => r.status === 'waiting').length,
      playingRooms: [...rooms.values()].filter(r => r.status === 'playing').length,
      totalPlayers: [...rooms.values()].reduce((sum, r) => sum + r.players.length, 0)
    };
    res.json(stats);
  });

  // Szoba lekérdezése (publikus info)
  router.get('/rooms/:id', (req, res) => {
    const room = gameManager.getRoom(req.params.id.toUpperCase());
    if (!room) {
      return res.status(404).json({ error: 'Szoba nem található.' });
    }

    res.json({
      id: room.id,
      status: room.status,
      playerCount: room.players.length,
      players: room.players.map(p => ({ name: p.name, score: p.score })),
      questionIndex: room.questionIndex + 1,
      totalQuestions: room.totalQuestions,
      combinedScore: room.combinedScore
    });
  });

  return router;
};
