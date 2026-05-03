// =============================================================
// DOJO FURY - main.js
// Wires up menus, character selection, and the Socket.IO client
// =============================================================

(() => {
  // ---------- Screen routing ----------
  const screens = {
    title:  document.getElementById('screen-title'),
    join:   document.getElementById('screen-join'),
    select: document.getElementById('screen-select'),
    game:   document.getElementById('screen-game')
  };

  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // ---------- Game session state ----------
  const session = {
    mode: 'solo',          // 'solo' | 'coop' | 'versus'
    isHost: true,
    mySlot: 1,
    roomCode: null,
    p1Char: null,
    p2Char: null,
    peerCharLocked: false
  };

  // ---------- Socket.IO networking ----------
  const NetworkClient = {
    socket: null,
    connected: false,

    init() {
      try {
        this.socket = io({ transports: ['websocket', 'polling'] });
      } catch (e) {
        console.warn('Socket.IO not available — solo mode only', e);
        return;
      }
      this.socket.on('connect', () => { this.connected = true; });
      this.socket.on('disconnect', () => { this.connected = false; });

      this.socket.on('peerJoined', ({ slot, character }) => {
        session.p2Char = character;
        renderSelectionState();
        document.getElementById('peer-status').textContent = `P2 IN — ${(CHARACTERS[character] || {}).name || character}`;
        const startBtn = document.getElementById('start-btn');
        if (session.isHost) startBtn.disabled = false;
      });

      this.socket.on('peerCharacter', ({ slot, character }) => {
        if (slot === 1) session.p1Char = character;
        else session.p2Char = character;
        renderSelectionState();
      });

      this.socket.on('peerLeft', () => {
        document.getElementById('peer-status').textContent = 'P2 LEFT';
        const startBtn = document.getElementById('start-btn');
        startBtn.disabled = true;
      });

      this.socket.on('gameStart', ({ stage, mode, players }) => {
        session.mode = mode;
        session.p1Char = players[1];
        session.p2Char = players[2];
        launchGame();
      });

      this.socket.on('peerState', (payload) => {
        Game.applyPeerState(payload);
      });
      this.socket.on('peerEvent', (payload) => {
        Game.applyPeerEvent(payload);
      });
    },

    send(event, payload) {
      if (this.socket && this.connected) this.socket.emit(event, payload);
    }
  };

  // expose helpers Game can call
  window.NetworkClient = NetworkClient;

  // ---------- Title screen actions ----------
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'host-coop')   startHost('coop');
      else if (a === 'host-versus') startHost('versus');
      else if (a === 'join')   show('join');
      else if (a === 'solo')   startSolo();
      else if (a === 'back-title') {
        Game.stop && Game.stop();
        document.getElementById('game-over-overlay').classList.remove('active');
        show('title');
      }
      else if (a === 'confirm-join') confirmJoin();
    });
  });

  function startSolo() {
    session.mode = 'solo';
    session.isHost = true;
    session.mySlot = 1;
    session.p1Char = null;
    session.p2Char = null;
    document.getElementById('mode-display').textContent = 'SOLO';
    document.getElementById('room-display').textContent = '----';
    document.getElementById('peer-status').textContent = 'PRACTICE MODE';
    document.getElementById('start-btn').disabled = true;
    renderSelectionState();
    show('select');
  }

  function startHost(mode) {
    NetworkClient.init();
    if (!NetworkClient.socket) {
      // fallback: solo
      alert('Multiplayer server unreachable. Starting solo mode.');
      startSolo();
      return;
    }
    session.mode = mode;
    session.isHost = true;
    session.mySlot = 1;
    session.p1Char = null;
    session.p2Char = null;

    NetworkClient.socket.emit('createRoom', { mode, character: null }, (resp) => {
      if (!resp.ok) {
        alert('Failed to create room: ' + (resp.error || 'unknown'));
        return;
      }
      session.roomCode = resp.code;
      document.getElementById('mode-display').textContent = mode.toUpperCase();
      document.getElementById('room-display').textContent = resp.code;
      document.getElementById('peer-status').textContent = 'WAITING FOR P2…';
      document.getElementById('start-btn').disabled = true;
      renderSelectionState();
      show('select');
    });
  }

  function confirmJoin() {
    const codeInput = document.getElementById('room-code-input');
    const code = (codeInput.value || '').toUpperCase();
    document.getElementById('join-error').textContent = '';
    if (code.length !== 4) {
      document.getElementById('join-error').textContent = 'CODE MUST BE 4 CHARACTERS';
      return;
    }
    NetworkClient.init();
    if (!NetworkClient.socket) {
      document.getElementById('join-error').textContent = 'CANNOT REACH SERVER';
      return;
    }
    session.isHost = false;
    session.mySlot = 2;

    NetworkClient.socket.emit('joinRoom', { code, character: null }, (resp) => {
      if (!resp.ok) {
        document.getElementById('join-error').textContent = (resp.error || 'JOIN FAILED').toUpperCase();
        return;
      }
      session.roomCode = resp.code;
      session.mode = resp.mode;
      session.p1Char = resp.hostCharacter;
      session.p2Char = null;
      document.getElementById('mode-display').textContent = resp.mode.toUpperCase();
      document.getElementById('room-display').textContent = resp.code;
      document.getElementById('peer-status').textContent = 'JOINED — WAITING FOR HOST TO START';
      document.getElementById('start-btn').disabled = true; // only host can start
      renderSelectionState();
      show('select');
    });
  }

  // ---------- Character selection ----------
  function setupCharCards() {
    document.querySelectorAll('.char-card').forEach(card => {
      card.addEventListener('click', () => {
        const charKey = card.dataset.char;
        if (session.mode === 'solo') {
          // first click = P1, second click on a (different) card = P2
          if (!session.p1Char) {
            session.p1Char = charKey;
          } else if (!session.p2Char && charKey !== session.p1Char) {
            session.p2Char = charKey;
          } else if (charKey === session.p1Char) {
            // toggle off P1 to reselect
            session.p1Char = null;
            session.p2Char = null;
          }
          // start enabled when at least P1 chosen
          document.getElementById('start-btn').disabled = !session.p1Char;
        } else {
          // online: pick MY character only
          if (session.mySlot === 1) session.p1Char = charKey;
          else session.p2Char = charKey;
          NetworkClient.send('changeCharacter', { character: charKey });
          // host needs both to be picked + peer present
          if (session.isHost) {
            const startBtn = document.getElementById('start-btn');
            startBtn.disabled = !(session.p1Char && session.p2Char);
          }
        }
        renderSelectionState();
      });
    });
  }

  function renderSelectionState() {
    document.querySelectorAll('.char-card').forEach(card => {
      card.classList.remove('selected-p1', 'selected-p2');
      if (card.dataset.char === session.p1Char) card.classList.add('selected-p1');
      if (card.dataset.char === session.p2Char) card.classList.add('selected-p2');
    });
  }

  // ---------- Start the actual game ----------
  document.getElementById('start-btn').addEventListener('click', () => {
    if (session.mode === 'solo') {
      launchGame();
    } else if (session.isHost) {
      // host fires start, server broadcasts gameStart to both clients
      NetworkClient.send('startGame', { stage: 1 });
      // gameStart event will trigger launchGame on both sides
    }
  });

  function launchGame() {
    show('game');
    // show controls overlay first time
    const overlay = document.getElementById('controls-overlay');
    overlay.style.display = 'flex';

    const startNow = () => {
      overlay.style.display = 'none';
      Game.start({
        gameMode: session.mode,
        hostFlag: session.isHost,
        slotNum: session.mySlot,
        p1Char: session.p1Char || 'ryu',
        p2Char: session.p2Char,
        network: NetworkClient.socket ? NetworkClient : null
      });
    };
    document.getElementById('dismiss-controls').onclick = startNow;
  }

  // Room code input: uppercase + sanitize
  document.getElementById('room-code-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  });

  // Allow Enter to confirm join
  document.getElementById('room-code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmJoin();
  });

  // ---------- INIT ----------
  initPortraits();
  setupCharCards();
  show('title');
})();
