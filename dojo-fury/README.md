# DOJO FURY ⚔

A 16-bit arcade beat 'em up with **co-op** and **versus** modes,
networked over Socket.IO. Three playable fighters, each with a
unique fighting-game-style special move executed via input
sequences. Procedurally drawn pixel sprites — no asset files
needed. CRT scanlines included.

---

## Features

- **3 fighters** with distinct stats and signature special moves
  - **Ryu Tenkai** — balanced monk · Dragon Fist (↓ ↘ → + Punch)
  - **Kira Neon** — fast cyber-ninja · Shadow Strike (→ → + Punch)
  - **Brick Stone** — heavy brawler · Earthquake (↓ ↓ + Kick)
- **Solo Practice** — 1P, or 2P sharing one keyboard
- **Co-op online** — host a room, share the 4-letter code, fight enemy waves together across 5 stages (with a final boss)
- **Versus online** — same room flow, but you fight each other to a K.O.
- **Special meter** that fills when you land hits; spend it on signature moves
- **Block, jump, walk, punch, kick** — all the basics
- **HUD with HP & special bars, stage counter, score**
- **Procedural pixel sprites + 80s synth SFX** — no media files

---

## Controls

### Solo / online (your local controls)
| Action | Key |
|-------|-----|
| Move | **W A S D** |
| Punch (A) | **J** |
| Kick (B) | **K** |
| Jump | **L** or **Space** |
| Block | **U** |

### 2P on the same keyboard (solo mode only)
| Action | Key |
|-------|-----|
| Move | **Arrow keys** |
| Punch | **1** |
| Kick | **2** |
| Jump | **3** |
| Block | **4** |

### Special move syntax
Specials use **directional inputs relative to the way you're facing** (like Street Fighter), then an attack button. They cost special meter (the thin purple bar). Auto-mirrored if you turn around.

---

## Run locally

```bash
npm install
npm start
```

Then open http://localhost:3000

To test multiplayer locally, open the URL in two browser windows. One hosts (gets a 4-letter code), the other joins.

---

## Deploy to Railway

### Option A — One-click via GitHub
1. Push this folder to a GitHub repo.
2. Go to https://railway.app, click **New Project → Deploy from GitHub repo**.
3. Select your repo. Railway auto-detects Node.js (via `package.json` and `railway.json`) and runs `node server.js`.
4. Under **Settings → Networking**, click **Generate Domain**. You'll get a `https://your-app.up.railway.app` URL.
5. Open it. Done — the same URL works for hosting *and* joining.

### Option B — Railway CLI
```bash
npm i -g @railway/cli
railway login
railway init
railway up
railway domain   # generates a public URL
```

### Notes about Railway
- The server listens on `process.env.PORT` (Railway injects this automatically).
- WebSockets work out of the box on Railway with the default HTTP service. No extra config needed.
- The free tier sleeps after inactivity but spins back up on first request — be ready for a ~5 second cold start when you visit.
- All static assets are served from `/public` by Express; Socket.IO is served at `/socket.io/socket.io.js` automatically by the library.

---

## Architecture

- **`server.js`** — Express + Socket.IO. Manages rooms (4-char codes), relays state and events between two peers per room. ~150 lines.
- **`public/index.html`** — Title, join, character-select, and game screens.
- **`public/style.css`** — Arcade aesthetic, scanlines, CRT vignette, neon palette.
- **`public/characters.js`** — Character/enemy stat blocks + procedural pixel sprite renderer.
- **`public/game.js`** — The core engine: physics, hit detection, AI, special-move sequence detector, render loop, and network sync.
- **`public/main.js`** — Menu navigation, character selection, Socket.IO client glue.

### Network model
A simple **peer-relay model** with **host-authoritative enemies**. Each client simulates its own player locally and sends position/state to the peer ~30 times per second (`socket.volatile.emit`). The host additionally simulates enemies and broadcasts their state every 4 frames. This is light enough to run smoothly on Railway's free tier and avoids needing a heavyweight server tick loop. Hit confirmation is local — each client trusts the other for its own HP, which is fine for a casual co-op brawler.

---

Made with one fist and a dream. 🥋
