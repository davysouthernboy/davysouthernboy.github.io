// Dojo Fury - multiplayer game server
// Authoritative-lite: server relays state and validates room membership.
// Designed for Railway deployment.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const PORT = process.env.PORT || 3000;

// Room registry. Rooms self-destruct when empty.
const rooms = new Map();

function makeRoomCode() {
  // 4-char human-friendly code, no confusing chars
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerSlot = null; // 1 or 2

  socket.on('createRoom', ({ mode, character }, cb) => {
    const code = makeRoomCode();
    rooms.set(code, {
      code,
      mode: mode || 'coop', // 'coop' or 'versus'
      host: socket.id,
      players: {
        1: { id: socket.id, character: character || 'ryu', ready: false }
      },
      started: false,
      createdAt: Date.now()
    });
    socket.join(code);
    currentRoom = code;
    playerSlot = 1;
    cb({ ok: true, code, slot: 1, mode: mode || 'coop' });
  });

  socket.on('joinRoom', ({ code, character }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (room.players[2]) return cb({ ok: false, error: 'Room is full' });
    if (room.started) return cb({ ok: false, error: 'Game already started' });

    room.players[2] = { id: socket.id, character: character || 'kira', ready: false };
    socket.join(room.code);
    currentRoom = room.code;
    playerSlot = 2;

    // Notify host
    io.to(room.host).emit('peerJoined', {
      slot: 2,
      character: room.players[2].character
    });

    cb({
      ok: true,
      code: room.code,
      slot: 2,
      mode: room.mode,
      hostCharacter: room.players[1].character
    });
  });

  socket.on('changeCharacter', ({ character }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || !playerSlot) return;
    room.players[playerSlot].character = character;
    socket.to(currentRoom).emit('peerCharacter', { slot: playerSlot, character });
  });

  socket.on('startGame', ({ stage }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || socket.id !== room.host) return;
    room.started = true;
    io.to(currentRoom).emit('gameStart', {
      stage: stage || 1,
      mode: room.mode,
      players: {
        1: room.players[1].character,
        2: room.players[2] ? room.players[2].character : null
      }
    });
  });

  // Hot path: position + state updates from each client.
  // Server simply relays to the other peer in the room.
  socket.on('state', (payload) => {
    if (!currentRoom) return;
    socket.to(currentRoom).volatile.emit('peerState', payload);
  });

  // Discrete events: hits, special moves, enemy spawns (host-authoritative for enemies)
  socket.on('event', (payload) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('peerEvent', payload);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    socket.to(currentRoom).emit('peerLeft', { slot: playerSlot });

    if (playerSlot) delete room.players[playerSlot];
    const remaining = Object.keys(room.players).length;
    if (remaining === 0) {
      rooms.delete(currentRoom);
    } else if (socket.id === room.host) {
      // Promote remaining player to host
      const otherSlot = Object.keys(room.players)[0];
      room.host = room.players[otherSlot].id;
    }
  });
});

// Cleanup stale rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > 1000 * 60 * 60 * 2) rooms.delete(code); // 2h max
  }
}, 1000 * 60 * 10);

server.listen(PORT, () => {
  console.log(`Dojo Fury server listening on :${PORT}`);
});
