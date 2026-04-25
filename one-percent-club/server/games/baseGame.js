/**
 * BaseGame - Abstract base class every game must extend.
 *
 * Subclasses implement game-specific logic. The framework (GameEngine)
 * handles sockets, rooms, player lifecycle, and message routing.
 *
 * Lifecycle:
 *   1. new GameInstance(room) when host creates a room with this game type
 *   2. onPlayerJoin(player) every time a player joins (lobby phase)
 *   3. onStart() when host clicks start
 *   4. onHostAction / onPlayerAction during gameplay
 *   5. onPlayerLeave when players drop
 *   6. broadcastState() to push updates
 */
class BaseGame {
  constructor(room) {
    this.room = room;
    this.phase = 'lobby'; // 'lobby' | 'playing' | 'ended'
    this.startedAt = null;
  }

  // --- Required overrides ---

  /** Return the game type identifier string. Override this. */
  static get gameType() { return 'base'; }

  /** Max players supported. Override if less than framework max. */
  static get maxPlayers() { return 200; }

  /** Display name shown to host. */
  static get displayName() { return 'Base Game'; }

  /** Called when a new player joins. Register them in game state. */
  onPlayerJoin(player) {
    // Override
  }

  /** Called when a player disconnects. */
  onPlayerLeave(player) {
    // Override
  }

  /** Called when a player reconnects (same playerId returned). */
  onPlayerReconnect(player) {
    // Default: re-send state
    this.sendStateToPlayer(player);
  }

  /** Host clicked start. */
  onStart() {
    this.phase = 'playing';
    this.startedAt = Date.now();
  }

  /** Message from host during play. `action` is the subtype, `data` is payload. */
  onHostAction(action, data) {
    // Override
  }

  /** Message from a player during play. */
  onPlayerAction(player, action, data) {
    // Override
  }

  /** Return state object tailored for this specific player. */
  getStateForPlayer(player) {
    return { phase: this.phase };
  }

  /** Return state object for host view. */
  getStateForHost() {
    return {
      phase: this.phase,
      playerCount: this.room.players.size,
    };
  }

  // --- Framework helpers (do not override) ---

  broadcastState() {
    this.room.broadcastState();
  }

  sendStateToPlayer(player) {
    this.room.sendStateToPlayer(player);
  }

  broadcastEvent(eventName, payload) {
    this.room.broadcastEvent(eventName, payload);
  }
}

module.exports = BaseGame;
