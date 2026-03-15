/**
 * Server - Alkalmazás indítása
 */

const http = require('http');
const { Server } = require('socket.io');
const createApp = require('./app');
const GameManager = require('./models/GameManager');
const socketHandler = require('./socketHandler');

const PORT = process.env.PORT || 3000;

const gameManager = new GameManager();
const app = createApp(gameManager);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// WebSocket kezelés
socketHandler(io, gameManager);

server.listen(PORT, () => {
  console.log(`🎮 COOP Quiz szerver fut: http://localhost:${PORT}`);
  console.log(`📡 WebSocket kész`);
});

module.exports = server;
