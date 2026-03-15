/**
 * App Factory - Express alkalmazás létrehozása
 * Külön van a server.js-től, hogy tesztelhető legyen
 */

const express = require('express');
const path = require('path');
const GameManager = require('./models/GameManager');
const apiRoutes = require('./routes/api');

function createApp(gameManager) {
  const app = express();
  const gm = gameManager || new GameManager();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // API routes
  app.use('/api', apiRoutes(gm));

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.gameManager = gm;
  return app;
}

module.exports = createApp;
