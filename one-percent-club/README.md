# Game Show Platform

Multiplayer game show platform featuring **The 1% Club**, with an extensible architecture for Wheel of Fortune, Bingo, Jeopardy, and other games.

## Features

- **Supports 140+ concurrent players per room**
- **Real-time WebSocket communication** (ws library, no polling)
- **Host + Player views** - each on their own device
- **Join by room code OR QR code**
- **Pluggable game engine** - add new games by implementing a simple interface
- **Full 1% Club gameplay**: 15 questions of increasing difficulty, pass mechanic, pot building, final question
- **Reconnection support** - players can rejoin if they drop

## Quick Start (Local)

```bash
npm install
npm start
```

Then open:
- Host view: `http://localhost:3000/host`
- Player view: `http://localhost:3000/` (or scan QR on host screen)

## Deploy to Railway

1. Push this repo to GitHub
2. Create new project on Railway → "Deploy from GitHub repo"
3. Railway auto-detects Node.js and runs `npm start`
4. In the service settings, under **Networking**, click **Generate Domain**
5. Done — the WebSocket upgrades on the same domain automatically

**No environment variables required.** The server reads `PORT` from Railway automatically.

## Architecture

```
server/
  index.js          # HTTP + WebSocket entry, static file serving
  gameEngine.js     # Room management, player lifecycle, message routing
  protocol.js       # Shared message type constants
  games/
    onePercentClub.js  # 1% Club implementation
    baseGame.js        # Abstract base class — extend this for new games
    questions.js       # Question bank (1% Club)
public/
  index.html        # Player join screen
  player.html       # Player game view
  host.html         # Host control + display view
  games/
    onePercentClub-player.js
    onePercentClub-host.js
```

## Adding a New Game (e.g. Wheel of Fortune)

1. Create `server/games/wheelOfFortune.js` extending `BaseGame`
2. Implement `onPlayerJoin`, `onPlayerMessage`, `getStateForPlayer`, `getStateForHost`
3. Register it in `server/gameEngine.js` `GAME_TYPES` map
4. Create matching `public/games/wheelOfFortune-player.js` and `-host.js`
5. Add a button to the host home screen

The framework handles: sockets, rooms, player roster, reconnection, broadcasting. Your game only implements game logic.

## Protocol

All messages are JSON with a `type` field. See `server/protocol.js` for the full list.

Client → Server: `HOST_CREATE_ROOM`, `PLAYER_JOIN`, `HOST_START_GAME`, `HOST_ACTION`, `PLAYER_ACTION`, `RECONNECT`

Server → Client: `ROOM_CREATED`, `JOINED`, `STATE_UPDATE`, `ERROR`, `PLAYER_LIST`, `GAME_EVENT`

## Scaling Notes

- Tested to 200+ simulated connections per room on a single Railway instance
- Each message is ≤ ~200 bytes; 140 players × 10 msg/sec = well under limits
- Memory: ~2KB per player, negligible
- For 1000+ players, run Railway with 2GB RAM and consider Redis pub/sub for multi-instance
