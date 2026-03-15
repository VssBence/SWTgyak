/**
 * COOP Quiz - Frontend kliens
 * Socket.IO kommunikáció + UI kezelés
 */

const socket = io();

// === STATE ===
let state = {
  playerName: '',
  roomId: null,
  isHost: false,
  currentScreen: 'lobby',
  timerInterval: null
};

// === DOM ELEMEK ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const screens = {
  lobby: $('#screen-lobby'),
  waiting: $('#screen-waiting'),
  game: $('#screen-game'),
  results: $('#screen-results')
};

// === SCREEN MANAGEMENT ===
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  state.currentScreen = name;
}

function showError(msg) {
  const el = $('#lobby-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// === LOBBY EVENTS ===
$('#btn-create').addEventListener('click', () => {
  const name = $('#player-name').value.trim();
  if (!name) return showError('Add meg a neved!');

  state.playerName = name;
  state.isHost = true;

  socket.emit('create-room', { playerName: name }, (res) => {
    if (res.error) return showError(res.error);
    state.roomId = res.roomId;
    showWaitingRoom(res.roomId, res.players);
  });
});

$('#btn-join').addEventListener('click', () => {
  const name = $('#player-name').value.trim();
  const code = $('#room-code').value.trim().toUpperCase();
  if (!name) return showError('Add meg a neved!');
  if (!code) return showError('Add meg a szobakódot!');

  state.playerName = name;
  state.isHost = false;

  socket.emit('join-room', { roomId: code, playerName: name }, (res) => {
    if (res.error) return showError(res.error);
    state.roomId = res.roomId;
    showWaitingRoom(res.roomId, res.players);
  });
});

// Enter billentyű kezelése
$('#player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const code = $('#room-code').value.trim();
    if (code) {
      $('#btn-join').click();
    } else {
      $('#btn-create').click();
    }
  }
});

$('#room-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-join').click();
});

// === WAITING ROOM ===
function showWaitingRoom(roomId, players) {
  showScreen('waiting');
  $('#display-room-code').textContent = roomId;
  updatePlayersList(players);
  updateStartButton(players.length);
}

function updatePlayersList(players) {
  const list = $('#players-list');
  list.innerHTML = '';

  // Első játékos
  const p1 = players[0];
  list.innerHTML += `
    <div class="player-card">
      <div class="player-icon">👤</div>
      <div class="player-name">${escapeHtml(p1.name)}</div>
    </div>
  `;

  // Második játékos vagy üres hely
  if (players[1]) {
    list.innerHTML += `
      <div class="player-card">
        <div class="player-icon">👤</div>
        <div class="player-name">${escapeHtml(players[1].name)}</div>
      </div>
    `;
  } else {
    list.innerHTML += `
      <div class="player-card empty">
        <div class="player-icon">❓</div>
        <div class="player-name">Várakozás...</div>
      </div>
    `;
  }
}

function updateStartButton(playerCount) {
  const btn = $('#btn-start');
  const msg = $('#waiting-msg');

  if (playerCount >= 2 && state.isHost) {
    btn.classList.remove('hidden');
    msg.textContent = 'Mindkét játékos kész!';
  } else if (playerCount >= 2 && !state.isHost) {
    msg.textContent = 'Várakozás a játék indítására...';
  } else {
    btn.classList.add('hidden');
    msg.textContent = 'Várakozás a másik játékosra...';
  }
}

$('#btn-start').addEventListener('click', () => {
  socket.emit('start-game', { roomId: state.roomId }, (res) => {
    if (res.error) alert(res.error);
  });
});

$('#btn-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(state.roomId).then(() => {
    $('#btn-copy-code').textContent = '✅';
    setTimeout(() => $('#btn-copy-code').textContent = '📋', 2000);
  });
});

// === GAME SCREEN ===
function showQuestion(data) {
  showScreen('game');

  $('#q-current').textContent = data.questionIndex;
  $('#q-total').textContent = data.totalQuestions;
  $('#question-text').textContent = data.question.text;
  $('#question-category').textContent = data.question.category;

  const diffEl = $('#question-difficulty');
  diffEl.textContent = { easy: 'Könnyű', medium: 'Közepes', hard: 'Nehéz' }[data.question.difficulty];
  diffEl.className = 'difficulty-badge ' + data.question.difficulty;

  // Options
  const grid = $('#options-grid');
  grid.innerHTML = '';
  data.question.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => submitAnswer(i));
    grid.appendChild(btn);
  });

  // Reset
  $('#round-result').classList.add('hidden');
  $('#partner-status').classList.add('hidden');
  $('#btn-next').classList.add('hidden');

  // Timer
  startTimer(data.timeLimit);
}

function submitAnswer(index) {
  // Disable all buttons
  $$('.option-btn').forEach(btn => btn.disabled = true);
  $$('.option-btn')[index].classList.add('selected');

  socket.emit('submit-answer', {
    roomId: state.roomId,
    answerIndex: index
  }, (res) => {
    if (res.error) return alert(res.error);
  });
}

function startTimer(seconds) {
  clearInterval(state.timerInterval);
  const fill = $('#timer-fill');
  let remaining = seconds;
  fill.style.width = '100%';
  fill.className = 'timer-fill';

  state.timerInterval = setInterval(() => {
    remaining -= 0.1;
    const pct = (remaining / seconds) * 100;
    fill.style.width = pct + '%';

    if (pct < 20) fill.className = 'timer-fill danger';
    else if (pct < 40) fill.className = 'timer-fill warning';

    if (remaining <= 0) {
      clearInterval(state.timerInterval);
      // Auto-submit invalid answer if not answered
      const anySelected = document.querySelector('.option-btn.selected');
      if (!anySelected) {
        submitAnswer(-1); // invalid, nem kap pontot
      }
    }
  }, 100);
}

function showRoundResult(data) {
  clearInterval(state.timerInterval);

  // Color the options
  $$('.option-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === data.correctIndex) btn.classList.add('correct');
    if (btn.classList.contains('selected') && i !== data.correctIndex) {
      btn.classList.add('wrong');
    }
  });

  // Result details
  const resultDiv = $('#result-details');
  let html = '';
  data.players.forEach(p => {
    const icon = p.wasCorrect ? '✅' : '❌';
    html += `<div class="result-player">
      <span>${icon} ${escapeHtml(p.name)}</span>
      <span>${p.score} pont</span>
    </div>`;
  });

  if (data.coopBonus > 0) {
    html += `<div class="coop-bonus">🤝 COOP Bónusz: +${data.coopBonus} pont mindkettőtöknek!</div>`;
  }

  resultDiv.innerHTML = html;
  $('#round-result').classList.remove('hidden');
  $('#team-score').textContent = data.combinedScore;

  // Next button (only host)
  if (state.isHost) {
    $('#btn-next').classList.remove('hidden');
  }
}

$('#btn-next').addEventListener('click', () => {
  socket.emit('next-question', { roomId: state.roomId }, (res) => {
    if (res.error) alert(res.error);
  });
});

// === RESULTS SCREEN ===
function showResults(data) {
  clearInterval(state.timerInterval);
  showScreen('results');

  $('#result-emoji').textContent = data.grade.emoji;
  $('#result-grade').textContent = data.grade.text;
  $('#final-combined').textContent = data.combinedScore;

  const scoresDiv = $('#player-scores');
  scoresDiv.innerHTML = '';
  data.players.forEach(p => {
    scoresDiv.innerHTML += `
      <div class="player-final">
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="score">${p.score}</div>
      </div>
    `;
  });

  // Animated score bar
  const pct = Math.round((data.combinedScore / data.maxPossible) * 100);
  setTimeout(() => {
    $('#score-bar-fill').style.width = pct + '%';
    $('#score-percentage').textContent = pct + '%';
  }, 300);
}

$('#btn-back-lobby').addEventListener('click', () => {
  state.roomId = null;
  state.isHost = false;
  showScreen('lobby');
});

// === SOCKET EVENTS ===
socket.on('player-joined', (data) => {
  updatePlayersList(data.players);
  updateStartButton(data.players.length);
});

socket.on('game-started', (data) => {
  showQuestion(data);
});

socket.on('player-answered', (data) => {
  $('#partner-status').classList.remove('hidden');
});

socket.on('round-result', (data) => {
  showRoundResult(data);
});

socket.on('next-question', (data) => {
  showQuestion(data);
});

socket.on('game-finished', (data) => {
  showResults(data);
});

socket.on('player-disconnected', (data) => {
  alert(`${data.disconnectedPlayer} lecsatlakozott. A játék véget ért.`);
  showScreen('lobby');
});

socket.on('disconnect', () => {
  if (state.currentScreen !== 'lobby') {
    alert('Megszakadt a kapcsolat a szerverrel.');
    showScreen('lobby');
  }
});

// === UTILS ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
