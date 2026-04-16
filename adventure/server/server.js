// ============================================================
//  Legend of Zelda Clone - Node.js / Socket.io Game Server
//  Option A: Railway hosts ONLY the multiplayer server
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'https://davysouthernboygithubio-production.up.railway.app',
    methods: ['GET', 'POST']
  }
});

// Health check
app.get('/', (_req, res) => {
  res.status(200).send('Zelda multiplayer server is running');
});

// ── Constants ──────────────────────────────────────────────
const TICK_MS = 50;          // 20 Hz server tick
const MAP_W = 32;            // tiles wide
const MAP_H = 24;            // tiles tall
const TILE = 32;             // px per tile
const PLAYER_SPD = 3;        // px per tick
const SWORD_MS = 300;        // sword hitbox duration
const ENEMY_SPD = 1;
const ENEMY_HP = 3;
const ARROW_SPD = 6;
const ROOM_TIMEOUT = 30000;  // 30 s to wait for 2nd player

// ── Tile map (0=grass, 1=wall, 2=water, 3=sand) ───────────
function buildMap() {
  const m = [];
  for (let y = 0; y < MAP_H; y++) {
    m.push([]);
    for (let x = 0; x < MAP_W; x++) {
      if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) {
        m[y].push(1);
        continue;
      }

      if (
        (x === 6 && y >= 4 && y <= 10) ||
        (x === 12 && y >= 12 && y <= 19) ||
        (x === 20 && y >= 3 && y <= 9) ||
        (x === 25 && y >= 14 && y <= 20) ||
        (y === 8 && x >= 14 && x <= 18) ||
        (y === 16 && x >= 6 && x <= 11)
      ) {
        m[y].push(1);
        continue;
      }

      if (
        (x >= 15 && x <= 17 && y >= 18 && y <= 21) ||
        (x >= 2 && x <= 4 && y >= 14 && y <= 17)
      ) {
        m[y].push(2);
        continue;
      }

      if (x >= 22 && x <= 28 && y >= 17 && y <= 22) {
        m[y].push(3);
        continue;
      }

      m[y].push(0);
    }
  }
  return m;
}

const BASE_MAP = buildMap();

// ── Enemy templates ────────────────────────────────────────
const ENEMY_STARTS = [
  { x: 7 * TILE, y: 5 * TILE },
  { x: 18 * TILE, y: 6 * TILE },
  { x: 14 * TILE, y: 14 * TILE },
  { x: 24 * TILE, y: 10 * TILE },
  { x: 9 * TILE, y: 18 * TILE },
  { x: 27 * TILE, y: 5 * TILE },
  { x: 4 * TILE, y: 10 * TILE },
  { x: 21 * TILE, y: 20 * TILE },
];

// ── Rooms ──────────────────────────────────────────────────
const rooms = new Map();
let nextRoom = 1;

class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = {};
    this.enemies = this.spawnEnemies();
    this.arrows = [];
    this.items = this.spawnItems();
    this.map = BASE_MAP;
    this.tick = 0;
    this.interval = null;
    this.waitTimer = null;
  }

  spawnEnemies() {
    return ENEMY_STARTS.map((s, i) => ({
      id: `e${i}`,
      x: s.x,
      y: s.y,
      hp: ENEMY_HP,
      maxHp: ENEMY_HP,
      dir: 'down',
      moveTimer: 0,
      moveDir: { x: 0, y: 1 },
      alive: true,
      type: i % 3
    }));
  }

  spawnItems() {
    return [
      { id: 'h1', type: 'heart', x: 10 * TILE, y: 7 * TILE, alive: true },
      { id: 'h2', type: 'heart', x: 22 * TILE, y: 12 * TILE, alive: true },
      { id: 'h3', type: 'heart', x: 5 * TILE, y: 20 * TILE, alive: true },
      { id: 'b1', type: 'bomb', x: 16 * TILE, y: 5 * TILE, alive: true },
      { id: 'b2', type: 'bomb', x: 28 * TILE, y: 20 * TILE, alive: true },
      { id: 'a1', type: 'arrow', x: 8 * TILE, y: 14 * TILE, alive: true }
    ];
  }

  addPlayer(socketId, name, colorIndex) {
    const idx = Object.keys(this.players).length;
    const start =
      idx === 0
        ? { x: 3 * TILE, y: 3 * TILE }
        : { x: 29 * TILE, y: 21 * TILE };

    this.players[socketId] = {
      id: socketId,
      name,
      colorIndex,
      x: start.x,
      y: start.y,
      hp: 6,
      maxHp: 6,
      dir: 'down',
      sword: false,
      swordTimer: 0,
      bombs: 3,
      arrows: 5,
      score: 0,
      dead: false,
      vx: 0,
      vy: 0,
      hitCooldown: 0
    };
  }

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.update(), TICK_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
  }

  update() {
    this.tick++;
    const plist = Object.values(this.players);

    // move players
    for (const p of plist) {
      if (p.dead) continue;

      const nx = p.x + p.vx;
      const ny = p.y + p.vy;

      if (!this.wallAt(nx, p.y, 16)) p.x = nx;
      if (!this.wallAt(p.x, ny, 16)) p.y = ny;

      p.x = Math.max(TILE, Math.min((MAP_W - 2) * TILE, p.x));
      p.y = Math.max(TILE, Math.min((MAP_H - 2) * TILE, p.y));

      if (p.swordTimer > 0) {
        p.swordTimer -= TICK_MS;
        if (p.swordTimer <= 0) {
          p.sword = false;
          p.swordTimer = 0;
        }
      }

      if (p.hitCooldown > 0) {
        p.hitCooldown -= TICK_MS;
        if (p.hitCooldown < 0) p.hitCooldown = 0;
      }
    }

    // move arrows
    this.arrows = this.arrows.filter((a) => {
      a.x += a.vx;
      a.y += a.vy;
      a.life -= TICK_MS;

      if (a.life <= 0 || this.wallAt(a.x, a.y, 4)) return false;

      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (this.dist(a.x, a.y, e.x + 16, e.y + 16) < 20) {
          e.hp--;
          if (e.hp <= 0) {
            e.alive = false;
            this.awardKill(a.ownerId);
          }
          return false;
        }
      }

      return true;
    });

    // move enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;

      e.moveTimer -= TICK_MS;

      if (e.moveTimer <= 0) {
        let nearest = null;
        let nearestDist = Infinity;

        for (const p of plist) {
          if (p.dead) continue;
          const d = this.dist(p.x, p.y, e.x, e.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = p;
          }
        }

        if (nearest && nearestDist < 10 * TILE) {
          const dx = nearest.x - e.x;
          const dy = nearest.y - e.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          e.moveDir = { x: dx / len, y: dy / len };
        } else {
          const dirs = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 }
          ];
          e.moveDir = dirs[Math.floor(Math.random() * 4)];
        }

        e.moveTimer = 400 + Math.random() * 600;
      }

      const nx = e.x + e.moveDir.x * ENEMY_SPD;
      const ny = e.y + e.moveDir.y * ENEMY_SPD;

      if (!this.wallAt(nx, e.y, 20)) e.x = nx;
      if (!this.wallAt(e.x, ny, 20)) e.y = ny;

      e.x = Math.max(TILE, Math.min((MAP_W - 2) * TILE, e.x));
      e.y = Math.max(TILE, Math.min((MAP_H - 2) * TILE, e.y));

      for (const p of plist) {
        if (p.dead || p.sword) continue;
        if (this.dist(p.x + 8, p.y + 8, e.x + 10, e.y + 10) < 26) {
          if (p.hitCooldown <= 0) {
            p.hp -= 1;
            p.hitCooldown = 1200;
            if (p.hp <= 0) {
              p.hp = 0;
              p.dead = true;
              p.vx = 0;
              p.vy = 0;
            }
          }
        }
      }
    }

    // sword hits enemies
    for (const p of plist) {
      if (!p.sword || p.dead) continue;

      const sx = p.x + (p.dir === 'right' ? 24 : p.dir === 'left' ? -24 : 0);
      const sy = p.y + (p.dir === 'down' ? 24 : p.dir === 'up' ? -24 : 0);

      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (this.dist(sx, sy, e.x + 16, e.y + 16) < 28) {
          e.hp--;
          if (e.hp <= 0) {
            e.alive = false;
            this.awardKill(p.id);
          }
        }
      }
    }

    // item pickup
    for (const item of this.items) {
      if (!item.alive) continue;
      for (const p of plist) {
        if (p.dead) continue;
        if (this.dist(p.x + 8, p.y + 8, item.x + 8, item.y + 8) < 22) {
          item.alive = false;
          if (item.type === 'heart') p.hp = Math.min(p.maxHp, p.hp + 2);
          if (item.type === 'bomb') p.bombs += 3;
          if (item.type === 'arrow') p.arrows += 5;
        }
      }
    }

    const allEnemiesDead = this.enemies.every((e) => !e.alive);

    io.to(this.id).emit('state', {
      players: plist.map((p) => ({
        id: p.id,
        name: p.name,
        colorIndex: p.colorIndex,
        x: p.x,
        y: p.y,
        dir: p.dir,
        hp: p.hp,
        maxHp: p.maxHp,
        sword: p.sword,
        dead: p.dead,
        bombs: p.bombs,
        arrows: p.arrows,
        score: p.score,
        hitCooldown: p.hitCooldown
      })),
      enemies: this.enemies,
      arrows: this.arrows,
      items: this.items.filter((i) => i.alive),
      allClear: allEnemiesDead
    });
  }

  wallAt(x, y, size) {
    const corners = [
      { cx: x, cy: y },
      { cx: x + size - 1, cy: y },
      { cx: x, cy: y + size - 1 },
      { cx: x + size - 1, cy: y + size - 1 }
    ];

    for (const c of corners) {
      const tx = Math.floor(c.cx / TILE);
      const ty = Math.floor(c.cy / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
      const t = this.map[ty][tx];
      if (t === 1 || t === 2) return true;
    }
    return false;
  }

  dist(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  awardKill(playerId) {
    if (this.players[playerId]) {
      this.players[playerId].score += 10;
    }
  }

  handleInput(socketId, input) {
    const p = this.players[socketId];
    if (!p || p.dead) return;

    const spd = PLAYER_SPD;
    p.vx = 0;
    p.vy = 0;

    if (input.up) {
      p.vy = -spd;
      p.dir = 'up';
    }
    if (input.down) {
      p.vy = spd;
      p.dir = 'down';
    }
    if (input.left) {
      p.vx = -spd;
      p.dir = 'left';
    }
    if (input.right) {
      p.vx = spd;
      p.dir = 'right';
    }

    if (input.sword && !p.sword) {
      p.sword = true;
      p.swordTimer = SWORD_MS;
    }

    if (input.shootArrow && p.arrows > 0) {
      p.arrows--;
      const dvx = p.dir === 'right' ? ARROW_SPD : p.dir === 'left' ? -ARROW_SPD : 0;
      const dvy = p.dir === 'down' ? ARROW_SPD : p.dir === 'up' ? -ARROW_SPD : 0;

      this.arrows.push({
        id: `ar${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        x: p.x + 8,
        y: p.y + 8,
        vx: dvx,
        vy: dvy,
        life: 2000,
        ownerId: socketId
      });
    }

    if (input.bomb && p.bombs > 0) {
      p.bombs--;
      const bx = p.x;
      const by = p.y;

      setTimeout(() => {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (this.dist(bx, by, e.x, e.y) < 64) {
            e.hp -= 2;
            if (e.hp <= 0) {
              e.alive = false;
              this.awardKill(socketId);
            }
          }
        }
        io.to(this.id).emit('explosion', { x: bx, y: by });
      }, 1500);

      io.to(this.id).emit('bombPlaced', { x: bx, y: by, ownerId: socketId });
    }
  }
}

// ── Matchmaking ────────────────────────────────────────────
let waitingRoom = null;

function getOrCreateRoom(mode) {
  if (mode === 'solo') {
    const r = new GameRoom(`room_${nextRoom++}`);
    rooms.set(r.id, r);
    return r;
  }

  if (!waitingRoom) {
    waitingRoom = new GameRoom(`room_${nextRoom++}`);
    rooms.set(waitingRoom.id, waitingRoom);

    waitingRoom.waitTimer = setTimeout(() => {
      if (waitingRoom && Object.keys(waitingRoom.players).length < 2) {
        waitingRoom.start();
        waitingRoom = null;
      }
    }, ROOM_TIMEOUT);

    return waitingRoom;
  }

  const r = waitingRoom;
  waitingRoom = null;

  if (r.waitTimer) {
    clearTimeout(r.waitTimer);
    r.waitTimer = null;
  }

  return r;
}

// ── Socket events ──────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] connected: ${socket.id}`);
  let myRoom = null;

  socket.on('join', ({ name, mode } = {}) => {
    const safeName = (name || 'Hero').toString().slice(0, 12);
    const safeMode = mode === 'solo' ? 'solo' : 'multi';
    const colorIndex = Math.floor(Math.random() * 4);

    myRoom = getOrCreateRoom(safeMode);
    myRoom.addPlayer(socket.id, safeName, colorIndex);
    socket.join(myRoom.id);

    const playerCount = Object.keys(myRoom.players).length;

    socket.emit('joined', {
      roomId: myRoom.id,
      playerId: socket.id,
      map: myRoom.map,
      colorIndex,
      playerCount,
      waiting: safeMode !== 'solo' && playerCount < 2
    });

    if (safeMode === 'solo' || playerCount === 2) {
      myRoom.start();
      io.to(myRoom.id).emit('gameStart', { playerCount });
    }
  });

  socket.on('input', (input) => {
    if (myRoom) {
      myRoom.handleInput(socket.id, input || {});
    }
  });

  socket.on('respawn', () => {
    if (!myRoom) return;
    const p = myRoom.players[socket.id];
    if (p && p.dead) {
      p.dead = false;
      p.hp = p.maxHp;
      p.x = 3 * TILE;
      p.y = 3 * TILE;
      p.vx = 0;
      p.vy = 0;
      p.hitCooldown = 0;
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] disconnected: ${socket.id}`);

    if (myRoom) {
      delete myRoom.players[socket.id];
      io.to(myRoom.id).emit('playerLeft', { id: socket.id });

      if (Object.keys(myRoom.players).length === 0) {
        myRoom.stop();
        rooms.delete(myRoom.id);
      }
    }

    if (waitingRoom && waitingRoom.id === myRoom?.id && Object.keys(waitingRoom.players).length === 0) {
      waitingRoom = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`🗡️ Zelda server running on port ${PORT}`);
});
