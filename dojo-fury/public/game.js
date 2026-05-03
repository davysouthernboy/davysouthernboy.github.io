// =============================================================
// DOJO FURY - Game engine
// Beat 'em up with co-op + versus, networked via Socket.IO
// =============================================================

const Game = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // World bounds (canvas is 960x540; floor at y=460)
  const FLOOR_Y = 460;
  const WORLD_LEFT = 40;
  const WORLD_RIGHT = 920;
  const GRAVITY = 0.85;
  const ATTACK_RANGE = 50;
  const ATTACK_DURATION = 14; // frames

  // Mode state
  let mode = 'solo';      // 'solo' | 'coop' | 'versus'
  let isHost = true;
  let mySlot = 1;
  let stage = 1;
  let score = 0;
  let frameTick = 0;
  let running = false;
  let paused = false;

  // Network (set by main.js)
  let net = null;

  // Inputs
  const keys = {};
  let p1Inputs = blankInputs();
  let p2Inputs = blankInputs();

  // Sequence buffers for special moves (per local player)
  const seqBufferP1 = []; // {dir, t}
  const seqBufferP2 = [];
  const SEQ_WINDOW = 35; // frames (~0.6s at 60fps)

  // Entities
  let p1 = null; // local fighter
  let p2 = null; // peer fighter (or local player 2 in solo offline)
  let enemies = [];
  let hitFx = [];        // hit sparks
  let combatTexts = [];  // floating "POW!" "+500" etc
  let stageProgress = 0; // # of enemies defeated this stage
  let stageGoal = 4;
  let stageMessageTimer = 0;
  let stageMessage = '';

  function blankInputs() {
    return { left: false, right: false, up: false, down: false, punch: false, kick: false, jump: false, block: false };
  }

  // =============================================================
  // INPUT
  // =============================================================
  const KEYMAP_P1 = {
    'KeyA': 'left', 'KeyD': 'right', 'KeyW': 'up', 'KeyS': 'down',
    'KeyJ': 'punch', 'KeyK': 'kick', 'KeyL': 'jump', 'KeyU': 'block',
    'Space': 'jump'
  };
  const KEYMAP_P2 = {
    'ArrowLeft': 'left', 'ArrowRight': 'right', 'ArrowUp': 'up', 'ArrowDown': 'down',
    'Digit1': 'punch', 'Numpad1': 'punch',
    'Digit2': 'kick',  'Numpad2': 'kick',
    'Digit3': 'jump',  'Numpad3': 'jump',
    'Digit4': 'block', 'Numpad4': 'block'
  };

  window.addEventListener('keydown', (e) => {
    if (!running) return;
    keys[e.code] = true;
    // Prevent scrolling on arrows / space
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  function readInputs() {
    // P1 always reads from the local "P1 controls"
    const np1 = blankInputs();
    for (const code in KEYMAP_P1) if (keys[code]) np1[KEYMAP_P1[code]] = true;

    // P2 reads from local P2 keys ONLY in solo mode (same keyboard)
    // In online modes, P2's inputs come from the network
    let np2 = blankInputs();
    if (mode === 'solo' && p2) {
      for (const code in KEYMAP_P2) if (keys[code]) np2[KEYMAP_P2[code]] = true;
    }

    p1Inputs = np1;
    if (mode === 'solo') p2Inputs = np2;
    // online: peer inputs received over network update p2Inputs directly
  }

  // =============================================================
  // FIGHTER FACTORY
  // =============================================================
  function makeFighter(charKey, slot, x, kind = 'player') {
    const def = (kind === 'player') ? CHARACTERS[charKey] : ENEMIES[charKey];
    return {
      kind,
      slot,                  // 1, 2, or 'enemy'
      def,
      charKey,
      x,
      y: FLOOR_Y,
      vx: 0,
      vy: 0,
      jumpY: 0,              // visual offset from floor
      facing: slot === 2 ? -1 : 1,
      hp: def.hp,
      maxHp: def.hp,
      special: 0,
      maxSpecial: 100,
      action: 'idle',        // idle | walking | punch | kick | special | hurt | block
      attackTime: 0,
      hurtTime: 0,
      hitstun: 0,
      blocking: false,
      walking: false,
      onGround: true,
      hasHit: false,         // for current attack swing
      ai: kind === 'enemy' ? { target: null, decisionTimer: 0, attackCD: 0 } : null,
      dead: false
    };
  }

  // =============================================================
  // STAGE MANAGEMENT (co-op)
  // =============================================================
  function spawnEnemyWave() {
    if (mode === 'versus') return;
    enemies = [];
    const waves = [
      { thug: 2 },                 // stage 1
      { thug: 3 },                 // stage 2
      { thug: 2, brawler: 1 },     // stage 3
      { brawler: 2, thug: 2 },     // stage 4
      { boss: 1, thug: 2 }         // stage 5 (boss)
    ];
    const wave = waves[Math.min(stage - 1, waves.length - 1)];
    let spawnX = 700;
    for (const type in wave) {
      for (let i = 0; i < wave[type]; i++) {
        const e = makeFighter(type, 'enemy', spawnX, 'enemy');
        e.facing = -1;
        enemies.push(e);
        spawnX += 60;
      }
    }
    stageGoal = enemies.length;
    stageProgress = 0;
    showStageMessage(`STAGE ${stage}`);
  }

  function showStageMessage(text) {
    stageMessage = text;
    stageMessageTimer = 120; // 2s
  }

  // =============================================================
  // SPECIAL MOVE DETECTION
  // =============================================================
  // We track DIRECTIONAL inputs (left/right/up/down/diagonals) plus
  // attack button presses; we look for the character's sequence
  // within a recent window.
  function pushSequenceInput(buf, input) {
    buf.push({ input, t: frameTick });
    while (buf.length && frameTick - buf[0].t > SEQ_WINDOW) buf.shift();
  }

  function checkSpecial(fighter, buf) {
    if (!CHARACTERS[fighter.charKey]) return false;
    const seq = CHARACTERS[fighter.charKey].specialSequence;
    if (buf.length < seq.length) return false;
    // last N entries must match (allow other inputs in between)
    // simpler: must match in order at the END of buffer
    let bi = buf.length - 1;
    let si = seq.length - 1;
    while (si >= 0 && bi >= 0) {
      if (buf[bi].input === seq[si]) {
        si--;
        bi--;
      } else {
        bi--;
      }
    }
    return si < 0;
  }

  function inputDirection(inputs, facing) {
    // Convert input + facing into "right/left/up/down/diagonal" relative to fighter
    // Specials are written for facing=right; mirror for left
    const fwd = facing === 1 ? 'right' : 'left';
    const back = facing === 1 ? 'left' : 'right';
    let h = inputs.right ? 'right' : inputs.left ? 'left' : null;
    let v = inputs.down ? 'down' : inputs.up ? 'up' : null;
    if (h && v) {
      // diagonal — only down-forward is used in our specials
      if (v === 'down' && h === fwd) return 'down-right';
      return null;
    }
    if (h === fwd) return 'right';
    if (h === back) return 'left';
    if (v) return v;
    return null;
  }

  // =============================================================
  // FIGHTER UPDATE
  // =============================================================
  function updateFighter(f, inputs, prevInputs, buf) {
    if (f.dead) return;

    // hurt / hitstun
    if (f.hurtTime > 0) f.hurtTime--;
    if (f.hitstun > 0) {
      f.hitstun--;
      f.action = 'hurt';
      // knockback decays
      f.x += f.vx;
      f.vx *= 0.85;
      clampFighter(f);
      return;
    }

    // attack frames
    if (f.action === 'punch' || f.action === 'kick' || f.action === 'special') {
      f.attackTime--;
      if (f.attackTime <= 0) {
        f.action = 'idle';
        f.hasHit = false;
      }
    }

    // air physics
    if (!f.onGround) {
      f.vy += GRAVITY;
      f.jumpY -= f.vy;
      if (f.jumpY <= 0) {
        f.jumpY = 0;
        f.vy = 0;
        f.onGround = true;
      }
    }

    // input handling (only if not in attack/hurt)
    const canAct = f.action === 'idle' || f.action === 'walking' || f.action === 'block';

    if (canAct && inputs) {
      // BLOCK
      f.blocking = !!inputs.block && f.onGround;
      f.action = f.blocking ? 'block' : 'idle';

      if (!f.blocking) {
        // MOVEMENT
        let mvx = 0;
        if (inputs.left)  mvx -= f.def.speed;
        if (inputs.right) mvx += f.def.speed;
        if (mvx !== 0 && f.onGround) {
          f.action = 'walking';
          f.walking = true;
          f.facing = mvx > 0 ? 1 : -1;
        } else {
          f.walking = false;
        }
        f.x += mvx;

        // JUMP
        if (inputs.jump && !prevInputs.jump && f.onGround) {
          f.vy = -f.def.jumpPower;
          f.onGround = false;
          f.jumpY = 1;
        }

        // ATTACKS - press detect (rising edge)
        const punchPress = inputs.punch && !prevInputs.punch;
        const kickPress = inputs.kick && !prevInputs.kick;

        // SPECIAL MOVE detection
        if (f.kind === 'player' && (punchPress || kickPress)) {
          // push the attack button onto buffer first
          pushSequenceInput(buf, punchPress ? 'punch' : 'kick');
          // check special
          if (f.special >= CHARACTERS[f.charKey].specialCost && checkSpecial(f, buf)) {
            startAttack(f, 'special');
            f.special -= CHARACTERS[f.charKey].specialCost;
            // visual flash
            spawnText(f.x, f.y - 100, CHARACTERS[f.charKey].specialName, CHARACTERS[f.charKey].specialColor);
            buf.length = 0;
            return;
          }
        }

        if (punchPress) startAttack(f, 'punch');
        else if (kickPress) startAttack(f, 'kick');

        // record direction inputs into buffer
        if (f.kind === 'player') {
          const dir = inputDirection(inputs, f.facing);
          if (dir) {
            const last = buf.length ? buf[buf.length - 1] : null;
            if (!last || last.input !== dir || frameTick - last.t > 4) {
              pushSequenceInput(buf, dir);
            }
          }
        }
      }
    }

    clampFighter(f);

    // recharge special slowly
    if (f.kind === 'player' && f.special < f.maxSpecial) {
      f.special = Math.min(f.maxSpecial, f.special + 0.08);
    }
  }

  function clampFighter(f) {
    if (f.x < WORLD_LEFT) f.x = WORLD_LEFT;
    if (f.x > WORLD_RIGHT) f.x = WORLD_RIGHT;
  }

  function startAttack(f, kind) {
    f.action = kind;
    f.attackTime = kind === 'special' ? 26 : ATTACK_DURATION;
    f.hasHit = false;
    if (kind === 'punch') sfx('punch');
    if (kind === 'kick')  sfx('kick');
    if (kind === 'special') sfx('special');
  }

  // =============================================================
  // COMBAT - hit detection
  // =============================================================
  function processHits() {
    const allFighters = [p1, p2, ...enemies].filter(Boolean);

    for (const attacker of allFighters) {
      if (attacker.dead) continue;
      if (attacker.action !== 'punch' && attacker.action !== 'kick' && attacker.action !== 'special') continue;
      if (attacker.hasHit) continue;
      // active hit window (mid-swing only)
      const animProgress = (attacker.action === 'special' ? 26 : ATTACK_DURATION) - attacker.attackTime;
      if (animProgress < 4 || animProgress > 12) continue;

      const reach = attacker.action === 'kick' ? ATTACK_RANGE + 18
                  : attacker.action === 'special' ? ATTACK_RANGE + 30
                  : ATTACK_RANGE;
      const hitX = attacker.x + attacker.facing * reach * 0.6;

      for (const target of allFighters) {
        if (target === attacker || target.dead) continue;
        // friendly fire rules
        if (mode === 'coop') {
          // Players cannot hit each other in co-op
          if (attacker.kind === 'player' && target.kind === 'player') continue;
          if (attacker.kind === 'enemy' && target.kind === 'enemy') continue;
        } else if (mode === 'versus') {
          // Players hit each other; no enemies in versus
          if (attacker.kind === 'enemy' || target.kind === 'enemy') continue;
        } else if (mode === 'solo') {
          // P1 vs enemies; if there's a P2 fighter, treat as co-op
          if (attacker.kind === 'enemy' && target.kind === 'enemy') continue;
        }

        const dx = Math.abs(target.x - hitX);
        const dy = Math.abs((target.y - target.jumpY) - (attacker.y - attacker.jumpY));
        if (dx < 30 && dy < 60) {
          // hit!
          applyHit(attacker, target);
          attacker.hasHit = true;
          break;
        }
      }
    }
  }

  function applyHit(attacker, target) {
    let dmg;
    if (attacker.action === 'punch') dmg = attacker.def.punchDmg;
    else if (attacker.action === 'kick') dmg = attacker.def.kickDmg;
    else dmg = (attacker.def.specialDmg || 25);

    // block reduces dmg
    if (target.blocking && Math.sign(target.facing) !== Math.sign(attacker.facing)) {
      dmg = Math.floor(dmg * 0.25);
      spawnFx(target.x, target.y - 50, '#00f0ff', 'block');
      sfx('block');
    } else {
      spawnFx(target.x + (attacker.facing > 0 ? -10 : 10), target.y - 50,
              attacker.action === 'special' ? attacker.def.specialColor : '#ffd23f',
              'hit');
      // knockback
      target.vx = attacker.facing * (attacker.action === 'special' ? 8 : 3);
      target.hitstun = attacker.action === 'special' ? 22 : 12;
      target.hurtTime = 18;
      sfx(attacker.action === 'special' ? 'special-hit' : 'hit');
    }

    target.hp -= dmg;
    if (target.hp <= 0) {
      target.hp = 0;
      target.dead = true;
      onDeath(target, attacker);
    }

    // special meter for landing hits (player attackers)
    if (attacker.kind === 'player') {
      attacker.special = Math.min(attacker.maxSpecial, attacker.special + (attacker.action === 'special' ? 0 : 6));
    }

    // damage number
    spawnText(target.x, target.y - 80, '-' + dmg, '#ff1f6d');

    // network event (so peer sees the hit)
    if (net && net.connected) {
      net.send('event', {
        type: 'hit',
        attackerSlot: attacker.slot,
        targetSlot: target.slot,
        targetIndex: enemies.indexOf(target),
        dmg,
        action: attacker.action
      });
    }
  }

  function onDeath(target, attacker) {
    if (target.kind === 'enemy') {
      score += target.def.score;
      stageProgress++;
      spawnText(target.x, target.y - 100, `+${target.def.score}`, '#4ade80');
      // remove later
      setTimeout(() => {
        const idx = enemies.indexOf(target);
        if (idx >= 0) enemies.splice(idx, 1);
        // stage clear?
        if (enemies.length === 0 && mode !== 'versus') {
          stage++;
          if (stage > 5) {
            endGame('VICTORY!', `FINAL SCORE: ${score}`);
          } else {
            setTimeout(spawnEnemyWave, 800);
          }
        }
      }, 600);
    } else if (target.kind === 'player') {
      if (mode === 'versus') {
        // versus: other player wins
        endGame(`P${attacker.slot} WINS!`, `K.O.`);
      } else {
        // co-op: if both players down -> game over
        const otherPlayer = (target === p1) ? p2 : p1;
        if (!otherPlayer || otherPlayer.dead) {
          endGame('GAME OVER', `SCORE: ${score}`);
        }
      }
    }
  }

  // =============================================================
  // ENEMY AI
  // =============================================================
  function updateEnemyAI(e) {
    if (e.dead || e.hitstun > 0) return;

    if (!e.ai.target || e.ai.target.dead) {
      // pick nearest player
      const candidates = [p1, p2].filter(p => p && !p.dead);
      if (candidates.length === 0) return;
      e.ai.target = candidates.reduce((a, b) =>
        Math.abs(a.x - e.x) < Math.abs(b.x - e.x) ? a : b
      );
    }

    const t = e.ai.target;
    const dx = t.x - e.x;
    const dist = Math.abs(dx);
    e.facing = dx > 0 ? 1 : -1;

    e.ai.attackCD = Math.max(0, e.ai.attackCD - 1);

    // pseudo-inputs for the enemy
    const fakeIn = blankInputs();

    if (dist > ATTACK_RANGE - 10) {
      // approach
      if (dx > 0) fakeIn.right = true; else fakeIn.left = true;
    } else if (e.ai.attackCD === 0) {
      // strike
      fakeIn.punch = true;
      e.ai.attackCD = 50 + Math.floor(Math.random() * 40);
    }

    updateFighter(e, fakeIn, blankInputs(), null);
  }

  // =============================================================
  // FX & TEXT
  // =============================================================
  function spawnFx(x, y, color, type) {
    hitFx.push({ x, y, color, type, life: 14, max: 14 });
  }
  function spawnText(x, y, text, color) {
    combatTexts.push({ x, y, text, color, life: 50, max: 50 });
  }

  // =============================================================
  // SOUND (procedural)
  // =============================================================
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
  }
  function sfx(kind) {
    ensureAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    let f1, f2, dur;
    switch (kind) {
      case 'punch':       o.type = 'square';   f1 = 220; f2 = 80;  dur = 0.07; break;
      case 'kick':        o.type = 'sawtooth'; f1 = 180; f2 = 60;  dur = 0.10; break;
      case 'hit':         o.type = 'square';   f1 = 380; f2 = 120; dur = 0.10; break;
      case 'block':       o.type = 'triangle'; f1 = 600; f2 = 800; dur = 0.06; break;
      case 'special':     o.type = 'sawtooth'; f1 = 80;  f2 = 600; dur = 0.30; break;
      case 'special-hit': o.type = 'square';   f1 = 700; f2 = 150; dur = 0.25; break;
      case 'jump':        o.type = 'square';   f1 = 300; f2 = 600; dur = 0.10; break;
      default:            o.type = 'square';   f1 = 440; f2 = 220; dur = 0.10;
    }
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t + dur);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // =============================================================
  // RENDER
  // =============================================================
  function render() {
    ctx.imageSmoothingEnabled = false;
    // bg
    drawBackground();

    // floor shadow line
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, FLOOR_Y - 4, canvas.width, 4);

    // sort by y for proper depth
    const drawables = [p1, p2, ...enemies].filter(Boolean).filter(f => !f.dead || f.hurtTime > 0);
    drawables.sort((a, b) => a.y - b.y);
    for (const f of drawables) {
      drawFighter(ctx, f.x, f.y, f.facing, {
        action: f.action,
        attackTime: f.attackTime,
        hurtTime: f.hurtTime,
        jumpY: f.jumpY,
        blocking: f.blocking,
        walking: f.walking
      }, f.def, frameTick);
    }

    // hit FX
    for (let i = hitFx.length - 1; i >= 0; i--) {
      const fx = hitFx[i];
      const a = fx.life / fx.max;
      ctx.globalAlpha = a;
      if (fx.type === 'block') {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, (1 - a) * 30 + 6, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // burst star
        ctx.fillStyle = fx.color;
        const r = (1 - a) * 28 + 6;
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + frameTick * 0.1;
          const px2 = fx.x + Math.cos(ang) * r;
          const py2 = fx.y + Math.sin(ang) * r;
          ctx.fillRect(px2 - 2, py2 - 2, 4, 4);
        }
        ctx.fillRect(fx.x - 4, fx.y - 4, 8, 8);
      }
      ctx.globalAlpha = 1;
      fx.life--;
      if (fx.life <= 0) hitFx.splice(i, 1);
    }

    // floating texts
    for (let i = combatTexts.length - 1; i >= 0; i--) {
      const t = combatTexts[i];
      const a = Math.min(1, t.life / 30);
      const offset = (t.max - t.life) * 0.6;
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color;
      ctx.font = 'bold 16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      // outline
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.strokeText(t.text, t.x, t.y - offset);
      ctx.fillText(t.text, t.x, t.y - offset);
      ctx.globalAlpha = 1;
      t.life--;
      if (t.life <= 0) combatTexts.splice(i, 1);
    }

    // stage banner
    if (stageMessageTimer > 0) {
      const a = Math.min(1, stageMessageTimer / 30);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 200, canvas.width, 100);
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 48px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 6;
      ctx.strokeText(stageMessage, canvas.width / 2, 270);
      ctx.fillText(stageMessage, canvas.width / 2, 270);
      ctx.globalAlpha = 1;
      stageMessageTimer--;
    }
  }

  function drawBackground() {
    // dojo backdrop - layered parallax
    // sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
    if (stage <= 2) {
      // sunset dojo
      sky.addColorStop(0, '#1a0a2e');
      sky.addColorStop(0.5, '#7a2a5a');
      sky.addColorStop(1, '#ff6b35');
    } else if (stage <= 4) {
      // night neon street
      sky.addColorStop(0, '#000');
      sky.addColorStop(1, '#1a0a3e');
    } else {
      // boss arena
      sky.addColorStop(0, '#3a0010');
      sky.addColorStop(1, '#000');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, FLOOR_Y);

    // distant mountains/buildings (parallax with frameTick)
    const layerOffset = (frameTick * 0.2) % 200;

    if (stage <= 2) {
      // mountain silhouettes
      ctx.fillStyle = '#2a1040';
      for (let i = -1; i < 6; i++) {
        const mx = i * 200 - layerOffset;
        ctx.beginPath();
        ctx.moveTo(mx, FLOOR_Y);
        ctx.lineTo(mx + 100, FLOOR_Y - 120);
        ctx.lineTo(mx + 200, FLOOR_Y);
        ctx.fill();
      }
      // sun
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(canvas.width / 2 + 100, 180, 50, 0, Math.PI * 2);
      ctx.fill();
      // dojo arch
      ctx.fillStyle = '#1a0512';
      ctx.fillRect(canvas.width / 2 - 200, FLOOR_Y - 200, 30, 200);
      ctx.fillRect(canvas.width / 2 + 170, FLOOR_Y - 200, 30, 200);
      ctx.fillRect(canvas.width / 2 - 230, FLOOR_Y - 220, 460, 30);
    } else if (stage <= 4) {
      // neon city
      for (let i = 0; i < 8; i++) {
        const bx = i * 130 - layerOffset * 0.5;
        const bh = 100 + (i % 3) * 60;
        ctx.fillStyle = `hsl(${260 + i * 10},60%,15%)`;
        ctx.fillRect(bx, FLOOR_Y - bh, 110, bh);
        // windows
        ctx.fillStyle = i % 2 === 0 ? '#00f0ff' : '#ff1f6d';
        for (let r = 0; r < bh / 20; r++) {
          for (let c = 0; c < 4; c++) {
            if (((i + r + c) * frameTick * 0.001 + r) % 7 < 5) {
              ctx.fillRect(bx + 15 + c * 22, FLOOR_Y - bh + 10 + r * 18, 8, 10);
            }
          }
        }
      }
    } else {
      // boss arena - lava/fire
      ctx.fillStyle = '#1a0010';
      ctx.fillRect(0, 0, canvas.width, FLOOR_Y);
      // flickering flames
      for (let i = 0; i < 20; i++) {
        const fx = (i * 50) % canvas.width;
        const fh = 30 + Math.sin(frameTick * 0.1 + i) * 15;
        ctx.fillStyle = `hsla(${10 + Math.sin(frameTick * 0.1 + i) * 20}, 100%, 50%, 0.4)`;
        ctx.fillRect(fx, FLOOR_Y - fh, 8, fh);
      }
    }

    // floor
    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(0, FLOOR_Y, canvas.width, canvas.height - FLOOR_Y);
    // floor planks / stripes
    ctx.fillStyle = '#0a0505';
    for (let i = 0; i < 15; i++) {
      ctx.fillRect((i * 70 - layerOffset * 2) % canvas.width, FLOOR_Y + 10 + i * 5, 60, 2);
    }
  }

  // =============================================================
  // MAIN LOOP
  // =============================================================
  function loop() {
    if (!running) return;
    if (!paused) {
      frameTick++;
      readInputs();
      const prevP1 = window._prevP1 || blankInputs();
      const prevP2 = window._prevP2 || blankInputs();

      if (p1) updateFighter(p1, p1Inputs, prevP1, seqBufferP1);
      if (p2) updateFighter(p2, p2Inputs, prevP2, seqBufferP2);

      // enemies (HOST-AUTHORITATIVE in coop; fully local in solo)
      if (mode !== 'versus' && (mode === 'solo' || isHost)) {
        for (const e of enemies) updateEnemyAI(e);
      }

      processHits();

      window._prevP1 = { ...p1Inputs };
      window._prevP2 = { ...p2Inputs };

      // network: send state every other frame
      if (net && net.connected && frameTick % 2 === 0) {
        const me = mySlot === 1 ? p1 : p2;
        if (me) {
          net.send('state', {
            slot: mySlot,
            x: me.x, y: me.y, facing: me.facing,
            jumpY: me.jumpY, hp: me.hp, special: me.special,
            action: me.action, attackTime: me.attackTime,
            blocking: me.blocking, walking: me.walking,
            hurtTime: me.hurtTime, dead: me.dead,
            inputs: mySlot === 1 ? p1Inputs : p2Inputs
          });
          // host also broadcasts enemy state
          if (isHost && mode === 'coop' && frameTick % 4 === 0) {
            net.send('event', {
              type: 'enemySync',
              enemies: enemies.map(e => ({
                charKey: e.charKey, x: e.x, y: e.y, facing: e.facing,
                jumpY: e.jumpY, hp: e.hp, action: e.action,
                attackTime: e.attackTime, hurtTime: e.hurtTime,
                walking: e.walking, dead: e.dead
              }))
            });
          }
        }
      }
    }

    render();
    updateHud();
    requestAnimationFrame(loop);
  }

  function updateHud() {
    if (p1) {
      document.querySelector('#hud-p1 .hud-bar-fill').style.width = `${(p1.hp / p1.maxHp) * 100}%`;
      document.querySelector('#hud-p1 .hud-special-fill').style.width = `${p1.special}%`;
      document.querySelector('#hud-p1 .hud-name').textContent = `P1 ${p1.def.name}`;
    }
    if (p2) {
      document.querySelector('#hud-p2 .hud-bar-fill').style.width = `${(p2.hp / p2.maxHp) * 100}%`;
      document.querySelector('#hud-p2 .hud-special-fill').style.width = `${p2.special}%`;
      document.querySelector('#hud-p2 .hud-name').textContent = `P2 ${p2.def.name}`;
    } else {
      document.querySelector('#hud-p2 .hud-bar-fill').style.width = `0%`;
      document.querySelector('#hud-p2 .hud-name').textContent = `--`;
    }
    document.getElementById('score').textContent = String(score).padStart(6, '0');
    document.getElementById('stage').textContent = stage;
  }

  // =============================================================
  // PUBLIC API
  // =============================================================
  function start({ gameMode, hostFlag, slotNum, p1Char, p2Char, network }) {
    mode = gameMode;
    isHost = hostFlag;
    mySlot = slotNum;
    net = network;
    score = 0;
    stage = 1;
    enemies = [];
    hitFx = [];
    combatTexts = [];
    frameTick = 0;

    // P1 + P2 fighters
    if (mode === 'versus') {
      p1 = makeFighter(p1Char || 'ryu', 1, 250);
      p2 = makeFighter(p2Char || 'kira', 2, 700);
      p2.facing = -1;
      showStageMessage('FIGHT!');
    } else {
      p1 = makeFighter(p1Char || 'ryu', 1, 200);
      if (p2Char) {
        p2 = makeFighter(p2Char, 2, 280);
      } else {
        p2 = null;
      }
      spawnEnemyWave();
    }

    running = true;
    paused = false;
    document.getElementById('game-over-overlay').classList.remove('active');
    requestAnimationFrame(loop);
  }

  function endGame(title, sub) {
    running = false;
    document.getElementById('game-over-title').textContent = title;
    document.getElementById('game-over-sub').textContent = sub;
    document.getElementById('game-over-overlay').classList.add('active');
  }

  function stop() {
    running = false;
  }

  // Network handlers (called by main.js)
  function applyPeerState(payload) {
    // Update the peer fighter (the one that's NOT mySlot)
    const peer = (mySlot === 1) ? p2 : p1;
    if (!peer) return;
    peer.x = payload.x;
    peer.y = payload.y;
    peer.facing = payload.facing;
    peer.jumpY = payload.jumpY;
    peer.action = payload.action;
    peer.attackTime = payload.attackTime;
    peer.blocking = payload.blocking;
    peer.walking = payload.walking;
    peer.hurtTime = payload.hurtTime;
    peer.dead = payload.dead;
    if (!isHost) {
      // non-host trusts peer's HP from peer's own client
      peer.hp = payload.hp;
      peer.special = payload.special;
    }
    // Also store peer's inputs so local update logic doesn't override animations
    if (mySlot === 1) p2Inputs = payload.inputs || blankInputs();
    else p1Inputs = payload.inputs || blankInputs();
  }

  function applyPeerEvent(payload) {
    if (payload.type === 'enemySync' && !isHost) {
      // reconcile enemies from host
      // simple replace — fine for our scale
      const incoming = payload.enemies;
      enemies = incoming.map(d => {
        const e = makeFighter(d.charKey, 'enemy', d.x, 'enemy');
        e.x = d.x; e.y = d.y; e.facing = d.facing;
        e.jumpY = d.jumpY; e.hp = d.hp; e.action = d.action;
        e.attackTime = d.attackTime; e.hurtTime = d.hurtTime;
        e.walking = d.walking; e.dead = d.dead;
        return e;
      });
    } else if (payload.type === 'hit') {
      // best-effort visual: spawn FX so peer sees hits land
      // (HP for players is authoritative per-player)
      // nothing else needed; state sync handles hp
    }
  }

  return {
    start, stop, endGame,
    applyPeerState, applyPeerEvent,
    isRunning: () => running,
    setMode: (m) => { mode = m; }
  };
})();
