# 🎮 COOP Quiz - Kooperatív Kvízjáték

Kétszemélyes kooperatív kvízjáték valós idejű WebSocket kommunikációval.

## 📋 Projekt leírás

A COOP Quiz egy böngészőalapú multiplayer kvízjáték, ahol két játékos együttműködve válaszol kérdésekre. A csapat összpontszámot gyűjt, és COOP bónuszt kap, ha mindketten helyesen válaszolnak.

### Főbb funkciók
- **Szoba rendszer**: 6 karakteres kóddal csatlakozhatnak egymáshoz a játékosok
- **Valós idejű kommunikáció**: Socket.IO WebSocket-en keresztül
- **COOP mechanika**: Bónusz pontok közös helyes válaszért
- **Időkorlát**: 20 másodperces időzítő kérdésenként
- **Pontszámítás**: Idő + nehézség alapú, COOP szorzóval
- **5 kategória**: Tudomány, Történelem, Informatika, Földrajz, Kultúra

## 🏗️ Architektúra

```
coop-quiz/
├── src/
│   ├── server.js          # Szerver belépési pont
│   ├── app.js             # Express app factory (tesztelhetőség)
│   ├── socketHandler.js   # WebSocket eseménykezelés
│   ├── models/
│   │   ├── GameManager.js # Játéklogika (core)
│   │   └── questions.js   # Kérdésbank
│   ├── routes/
│   │   └── api.js         # REST API végpontok
│   ├── public/
│   │   ├── index.html     # SPA főoldal
│   │   ├── css/style.css  # Stílusok
│   │   └── js/game.js     # Frontend kliens
│   └── tests/
│       ├── gameManager.test.js  # Unit tesztek
│       ├── api.test.js          # Integrációs tesztek
│       └── questions.test.js    # Kérdésbank validáció
├── package.json
└── README.md
```

## 🛠️ Technológiák

| Réteg | Technológia |
|-------|-------------|
| Backend | Node.js + Express |
| Valós idő | Socket.IO |
| Frontend | HTML5, CSS3, Vanilla JS |
| Tesztelés | Jest + Supertest |

## 🚀 Telepítés és futtatás

```bash
# Függőségek telepítése
npm install

# Szerver indítása (fejlesztés)
npm run dev

# Szerver indítása (produkció)
npm start

# Böngészőben: http://localhost:3000
```

## Jatek baratokkal (tavoli hozzaferes)

Ha nem ugyanazon a halozaton vagytok, hasznalj **ngrok**-ot a szerver megosztasahoz:

### 1. Ngrok telepitese
- Toltsd le: https://ngrok.com/download
- Vagy Windows-on: `winget install ngrok`

### 2. Szerver inditasa ngrok-kal
```bash
# 1. Inditsd el a szervert
npm start

# 2. Masik terminalban inditsd el az ngrok-ot
ngrok http 3000
```

### 3. URL megosztasa
Az ngrok ad egy publikus URL-t (pl. `https://xyz123.ngrok-free.dev`).
Kuldd el ezt a linket a baratodnak - mindketten ezen keresztul jatszhattok!

> **Tipp**: Ha ugyanazon a WiFi halozaton vagytok, egyszeruen hasznald a geped helyi IP cimet: `http://192.168.x.x:3000`

## 🧪 Tesztelés

```bash
# Összes teszt futtatása
npm test

# Tesztek watch módban
npm run test:watch

# Code coverage riport
npm run test:coverage
```

### Teszt struktúra

| Fájl | Típus | Mit tesztel |
|------|-------|-------------|
| `gameManager.test.js` | Unit | Szobakezelés, pontszámítás, COOP bónusz, játékmenet |
| `api.test.js` | Integrációs | REST végpontok, HTTP válaszok, statikus fájlok |
| `questions.test.js` | Validáció | Kérdésformátum, kategóriák, duplikáció |

## 📡 API végpontok

| Metódus | Útvonal | Leírás |
|---------|---------|--------|
| GET | `/api/health` | Szerver állapot |
| GET | `/api/stats` | Aktív szobák statisztikái |
| GET | `/api/rooms/:id` | Szoba részletek |

## 🔌 WebSocket események

### Kliens → Szerver
| Esemény | Adat | Leírás |
|---------|------|--------|
| `create-room` | `{ playerName }` | Szoba létrehozása |
| `join-room` | `{ roomId, playerName }` | Csatlakozás |
| `start-game` | `{ roomId }` | Játék indítása |
| `submit-answer` | `{ roomId, answerIndex }` | Válasz beküldése |
| `next-question` | `{ roomId }` | Következő kérdés |

### Szerver → Kliens
| Esemény | Leírás |
|---------|--------|
| `player-joined` | Új játékos csatlakozott |
| `game-started` | Játék elindult + első kérdés |
| `player-answered` | A másik játékos válaszolt |
| `round-result` | Kör eredménye (mindketten válaszoltak) |
| `next-question` | Új kérdés érkezett |
| `game-finished` | Végeredmény |
| `player-disconnected` | Játékos lecsatlakozott |

## 👥 Csapattagok feladatmegosztása

### 1. fő - Backend fejlesztő
- `GameManager.js` - játéklogika
- `questions.js` - kérdésbank bővítése
- `gameManager.test.js` - unit tesztek

### 2. fő - Frontend fejlesztő
- `index.html` - UI struktúra
- `style.css` - dizájn, reszponzivitás
- `game.js` - kliens logika

### 3. fő - Integráció & DevOps
- `socketHandler.js` - WebSocket kezelés
- `api.js` - REST végpontok
- `api.test.js` + `questions.test.js` - integrációs tesztek
- Dokumentáció, README

## 📜 Licensz

Egyetemi projekt - Szoftvertechnológia kurzus, Miskolci Egyetem
