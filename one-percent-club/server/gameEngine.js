const PROTOCOL = require('./protocol');
const OnePercentClubGame = require('./games/onePercentClub');

// Registry of available games. Add new games here.
const GAME_TYPES = {
  [OnePercentClubGame.gameType]: OnePercentClubGame,
  // 'wheelOfFortune': WheelOfFortuneGame,
  // 'bingo': BingoGame,
  // 'jeopardy': JeopardyGame,
};

const MAX_PLAYERS_PER_ROOM = 200; // supports 140+ with headroom
const ROOM_CODE_LENGTH = 5;
const ROOM_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

function generateRoomCode() {
  // Avoid ambiguous chars (0/O, 1/I)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generatePlayerId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

class Player {
  constructor(id, name, ws) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    this.state = null; // game-specific state
    this.disconnected = false;
    this.joinedAt = Date.now();
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(msg)); } catch (e) { /* noop */ }
    }
  }
}

class Room {
  constructor(code, gameType, hostWs) {
    this.code = code;
    this.gameType = gameType;
    this.hostWs = hostWs;
    this.hostId = generatePlayerId();
    this.players = new Map(); // playerId -> Player
    this.createdAt = Date.now();
    this.lastActivity = Date.now();

    const GameClass = GAME_TYPES[gameType];
    if (!GameClass) throw new Error(`Unknown game type: ${gameType}`);
    this.game = new GameClass(this);
  }

  addPlayer(name, ws) {
    if (this.players.size >= MAX_PLAYERS_PER_ROOM) {
      return { error: 'Room is full' };
    }
    const id = generatePlayerId();
    const player = new Player(id, name, ws);
    this.players.set(id, player);
    this.game.onPlayerJoin(player);
    this.lastActivity = Date.now();
    return { player };
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.game.onPlayerLeave(player);
      // Don't delete - keep state for reconnection. Actual removal on room cleanup.
      player.disconnected = true;
      player.ws = null;
    }
  }

  reconnectPlayer(playerId, ws) {
    const player = this.players.get(playerId);
    if (!player) return null;
    player.ws = ws;
    player.disconnected = false;
    this.game.onPlayerReconnect(player);
    this.lastActivity = Date.now();
    return player;
  }

  setHostWs(ws) {
    this.hostWs = ws;
  }

  broadcastState() {
    for (const player of this.players.values()) {
      if (!player.disconnected) this.sendStateToPlayer(player);
    }
    this.sendStateToHost();
  }

  sendStateToPlayer(player) {
    const state = this.game.getStateForPlayer(player);
    player.send({ type: PROTOCOL.STATE_UPDATE, role: 'player', state });
  }

  sendStateToHost() {
    if (this.hostWs && this.hostWs.readyState === 1) {
      const state = this.game.getStateForHost();
      try {
        this.hostWs.send(JSON.stringify({
          type: PROTOCOL.STATE_UPDATE,
          role: 'host',
          state,
          roomCode: this.code,
        }));
      } catch (e) { /* noop */ }
    }
  }

  broadcastEvent(eventName, payload) {
    const msg = { type: PROTOCOL.GAME_EVENT, event: eventName, payload };
    for (const player of this.players.values()) {
      player.send(msg);
    }
    if (this.hostWs && this.hostWs.readyState === 1) {
      try { this.hostWs.send(JSON.stringify(msg)); } catch (e) {}
    }
  }
}

class GameEngine {
  constructor() {
    this.rooms = new Map(); // roomCode -> Room
    this.wsToRoom = new Map(); // ws -> { roomCode, playerId | null (null = host) }

    // Periodic cleanup of idle rooms
    setInterval(() => this.cleanupIdleRooms(), 60 * 60 * 1000);
  }

  cleanupIdleRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivity > ROOM_IDLE_TIMEOUT_MS) {
        this.rooms.delete(code);
      }
    }
  }

  createRoom(gameType, hostWs) {
    let code;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const room = new Room(code, gameType, hostWs);
    this.rooms.set(code, room);
    this.wsToRoom.set(hostWs, { roomCode: code, playerId: null });
    return room;
  }

  handleMessage(ws, rawMsg) {
    let msg;
    try { msg = JSON.parse(rawMsg); } catch (e) { return; }

    switch (msg.type) {
      case PROTOCOL.HOST_CREATE_ROOM:
        return this.handleHostCreateRoom(ws, msg);
      case PROTOCOL.PLAYER_JOIN:
        return this.handlePlayerJoin(ws, msg);
      case PROTOCOL.RECONNECT:
        return this.handleReconnect(ws, msg);
      case PROTOCOL.HOST_START_GAME:
        return this.handleHostStartGame(ws);
      case PROTOCOL.HOST_ACTION:
        return this.handleHostAction(ws, msg);
      case PROTOCOL.PLAYER_ACTION:
        return this.handlePlayerAction(ws, msg);
      case PROTOCOL.PING:
        return ws.send(JSON.stringify({ type: PROTOCOL.PONG }));
    }
  }

  handleHostCreateRoom(ws, msg) {
    const gameType = msg.gameType || 'onePercentClub';
    if (!GAME_TYPES[gameType]) {
      return this.sendError(ws, `Unknown game type: ${gameType}`);
    }
    const room = this.createRoom(gameType, ws);
    ws.send(JSON.stringify({
      type: PROTOCOL.ROOM_CREATED,
      roomCode: room.code,
      hostId: room.hostId,
      gameType: room.gameType,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
    }));
    room.sendStateToHost();
  }

  handlePlayerJoin(ws, msg) {
    const { roomCode, name } = msg;
    const room = this.rooms.get((roomCode || '').toUpperCase());
    if (!room) return this.sendError(ws, 'Room not found');

    const cleanName = (name || 'Player').toString().slice(0, 30).trim() || 'Player';
    const result = room.addPlayer(cleanName, ws);
    if (result.error) return this.sendError(ws, result.error);

    this.wsToRoom.set(ws, { roomCode: room.code, playerId: result.player.id });
    ws.send(JSON.stringify({
      type: PROTOCOL.JOINED,
      playerId: result.player.id,
      roomCode: room.code,
      name: cleanName,
    }));
    room.sendStateToPlayer(result.player);
    room.sendStateToHost();
  }

  handleReconnect(ws, msg) {
    const { roomCode, playerId, isHost, hostId } = msg;
    const room = this.rooms.get((roomCode || '').toUpperCase());
    if (!room) return this.sendError(ws, 'Room not found');

    if (isHost) {
      if (room.hostId !== hostId) return this.sendError(ws, 'Invalid host credentials');
      room.setHostWs(ws);
      this.wsToRoom.set(ws, { roomCode: room.code, playerId: null });
      ws.send(JSON.stringify({
        type: PROTOCOL.ROOM_CREATED,
        roomCode: room.code,
        hostId: room.hostId,
        gameType: room.gameType,
        reconnected: true,
      }));
      room.sendStateToHost();
      return;
    }

    const player = room.reconnectPlayer(playerId, ws);
    if (!player) return this.sendError(ws, 'Player not found');
    this.wsToRoom.set(ws, { roomCode: room.code, playerId: player.id });
    ws.send(JSON.stringify({
      type: PROTOCOL.JOINED,
      playerId: player.id,
      roomCode: room.code,
      name: player.name,
      reconnected: true,
    }));
    room.sendStateToPlayer(player);
    room.sendStateToHost();
  }

  handleHostStartGame(ws) {
    const binding = this.wsToRoom.get(ws);
    if (!binding || binding.playerId !== null) return this.sendError(ws, 'Not a host');
    const room = this.rooms.get(binding.roomCode);
    if (!room) return;
    room.game.onStart();
  }

  handleHostAction(ws, msg) {
    const binding = this.wsToRoom.get(ws);
    if (!binding || binding.playerId !== null) return this.sendError(ws, 'Not a host');
    const room = this.rooms.get(binding.roomCode);
    if (!room) return;
    room.game.onHostAction(msg.action, msg.data || {});
    room.lastActivity = Date.now();
  }

  handlePlayerAction(ws, msg) {
    const binding = this.wsToRoom.get(ws);
    if (!binding || !binding.playerId) return;
    const room = this.rooms.get(binding.roomCode);
    if (!room) return;
    const player = room.players.get(binding.playerId);
    if (!player) return;
    room.game.onPlayerAction(player, msg.action, msg.data || {});
    room.lastActivity = Date.now();
  }

  handleDisconnect(ws) {
    const binding = this.wsToRoom.get(ws);
    if (!binding) return;
    this.wsToRoom.delete(ws);
    const room = this.rooms.get(binding.roomCode);
    if (!room) return;

    if (binding.playerId === null) {
      // Host disconnected - keep room alive for reconnect, just null the ws
      room.hostWs = null;
    } else {
      room.removePlayer(binding.playerId);
      room.sendStateToHost();
    }
  }

  sendError(ws, message) {
    ws.send(JSON.stringify({ type: PROTOCOL.ERROR, message }));
  }

  getStats() {
    return {
      rooms: this.rooms.size,
      totalPlayers: [...this.rooms.values()].reduce((n, r) => n + r.players.size, 0),
      games: Object.keys(GAME_TYPES),
    };
  }
}

module.exports = { GameEngine, GAME_TYPES };
