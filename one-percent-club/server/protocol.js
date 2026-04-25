// Shared message type constants. If running in browser, attached to window.PROTOCOL.
// In Node, exported via module.exports.

const PROTOCOL = {
  // Client -> Server
  HOST_CREATE_ROOM: 'HOST_CREATE_ROOM',
  HOST_START_GAME: 'HOST_START_GAME',
  HOST_ACTION: 'HOST_ACTION',        // advance question, reveal answer, etc.
  PLAYER_JOIN: 'PLAYER_JOIN',
  PLAYER_ACTION: 'PLAYER_ACTION',     // submit answer, use pass, leave with money
  RECONNECT: 'RECONNECT',             // with saved playerId + roomCode
  PING: 'PING',

  // Server -> Client
  ROOM_CREATED: 'ROOM_CREATED',
  JOINED: 'JOINED',
  STATE_UPDATE: 'STATE_UPDATE',       // full game state push
  PLAYER_LIST: 'PLAYER_LIST',         // roster updates to host
  GAME_EVENT: 'GAME_EVENT',           // fire-and-forget events (sound cues, etc.)
  ERROR: 'ERROR',
  PONG: 'PONG',

  // Host action subtypes (sent inside HOST_ACTION payload.action)
  ACTIONS: {
    NEXT_QUESTION: 'NEXT_QUESTION',
    REVEAL_ANSWER: 'REVEAL_ANSWER',
    LOCK_ANSWERS: 'LOCK_ANSWERS',
    SKIP_QUESTION: 'SKIP_QUESTION',
    OFFER_WALKAWAY: 'OFFER_WALKAWAY',
    END_GAME: 'END_GAME',
    RESET_GAME: 'RESET_GAME',
  },

  // Player action subtypes
  PLAYER_ACTIONS: {
    SUBMIT_ANSWER: 'SUBMIT_ANSWER',
    USE_PASS: 'USE_PASS',
    WALK_AWAY: 'WALK_AWAY',           // accept $10k share
    ATTEMPT_FINAL: 'ATTEMPT_FINAL',   // go for 1%
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PROTOCOL;
} else if (typeof window !== 'undefined') {
  window.PROTOCOL = PROTOCOL;
}
