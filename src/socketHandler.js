/**
 * Socket Handler - WebSocket eseménykezelés
 * Kezeli a valós idejű kommunikációt a játékosok között
 */

module.exports = function(io, gameManager) {

  io.on('connection', (socket) => {
    console.log(`Játékos csatlakozott: ${socket.id}`);

    // --- Szoba létrehozása ---
    socket.on('create-room', ({ playerName }, callback) => {
      if (!playerName || playerName.trim().length === 0) {
        return callback({ error: 'A név megadása kötelező.' });
      }
      if (playerName.trim().length > 20) {
        return callback({ error: 'A név maximum 20 karakter lehet.' });
      }

      const { roomId, room } = gameManager.createRoom(playerName.trim(), socket.id);
      socket.join(roomId);

      console.log(`Szoba létrehozva: ${roomId} - Host: ${playerName}`);

      callback({
        success: true,
        roomId,
        players: room.players.map(p => ({ name: p.name, score: p.score }))
      });
    });

    // --- Csatlakozás szobához ---
    socket.on('join-room', ({ roomId, playerName }, callback) => {
      if (!playerName || playerName.trim().length === 0) {
        return callback({ error: 'A név megadása kötelező.' });
      }
      if (!roomId) {
        return callback({ error: 'A szobakód megadása kötelező.' });
      }

      const result = gameManager.joinRoom(roomId.toUpperCase(), playerName.trim(), socket.id);

      if (result.error) {
        return callback({ error: result.error });
      }

      socket.join(roomId.toUpperCase());

      console.log(`${playerName} csatlakozott: ${roomId}`);

      // Értesítjük a szobában lévőket
      io.to(roomId.toUpperCase()).emit('player-joined', {
        players: result.room.players.map(p => ({ name: p.name, score: p.score })),
        newPlayer: playerName.trim()
      });

      callback({
        success: true,
        roomId: roomId.toUpperCase(),
        players: result.room.players.map(p => ({ name: p.name, score: p.score }))
      });
    });

    // --- Játék indítása ---
    socket.on('start-game', ({ roomId }, callback) => {
      const room = gameManager.getRoom(roomId);
      if (!room) return callback({ error: 'Szoba nem található.' });
      if (room.players[0].id !== socket.id) {
        return callback({ error: 'Csak a szoba létrehozója indíthatja a játékot.' });
      }

      const result = gameManager.startGame(roomId);
      if (result.error) return callback({ error: result.error });

      io.to(roomId).emit('game-started', result);
      callback({ success: true });
    });

    // --- Válasz beküldése ---
    socket.on('submit-answer', ({ roomId, answerIndex }, callback) => {
      const result = gameManager.submitAnswer(roomId, socket.id, answerIndex);

      if (result.error) {
        return callback({ error: result.error });
      }

      // Jelezzük, hogy valaki válaszolt (név nélkül, nehogy lássák a választ)
      socket.to(roomId).emit('player-answered', {
        playerName: result.playerName
      });

      // Ha mindenki válaszolt, elküldjük az eredményt
      if (result.allAnswered) {
        io.to(roomId).emit('round-result', {
          correctIndex: result.correctIndex,
          players: result.players,
          coopBonus: result.coopBonus,
          combinedScore: result.combinedScore
        });
      }

      callback({ success: true, isCorrect: result.isCorrect, points: result.points });
    });

    // --- Következő kérdés kérése ---
    socket.on('next-question', ({ roomId }, callback) => {
      const room = gameManager.getRoom(roomId);
      if (!room) return callback({ error: 'Szoba nem található.' });
      if (room.players[0].id !== socket.id) {
        return callback({ error: 'Csak a szoba létrehozója léphet tovább.' });
      }

      const result = gameManager.nextQuestion(roomId);

      if (result.status === 'finished') {
        io.to(roomId).emit('game-finished', result);
      } else {
        io.to(roomId).emit('next-question', result);
      }

      callback({ success: true });
    });

    // --- Lecsatlakozás ---
    socket.on('disconnect', () => {
      console.log(`Játékos lecsatlakozott: ${socket.id}`);
      const result = gameManager.handleDisconnect(socket.id);

      if (result && !result.roomDeleted) {
        io.to(result.roomId).emit('player-disconnected', {
          disconnectedPlayer: result.disconnectedPlayer,
          remainingPlayers: result.remainingPlayers
        });
      }
    });
  });
};
