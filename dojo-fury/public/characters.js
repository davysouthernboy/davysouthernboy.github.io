// =============================================================
// DOJO FURY - Character roster
// Each character has stats, special move(s), and a color palette
// used by the procedural sprite renderer.
// =============================================================

const CHARACTERS = {
  ryu: {
    id: 'ryu',
    name: 'RYU TENKAI',
    title: 'The Wandering Monk',
    hp: 130,
    speed: 3.6,
    jumpPower: 13,
    punchDmg: 8,
    kickDmg: 12,
    specialName: 'DRAGON FIST',
    // Quarter circle forward + punch (Street Fighter style)
    specialSequence: ['down', 'down-right', 'right', 'punch'],
    specialDmg: 28,
    specialCost: 50,
    specialColor: '#ffd23f',
    palette: {
      skin: '#f4c98a',
      skinDark: '#c89060',
      gi: '#fef5e7',         // white gi
      giShadow: '#a8a094',
      belt: '#1a1a1a',
      hair: '#1a1a1a',
      hairHighlight: '#3d3d3d',
      accent: '#ff1f6d',     // headband
      accentDark: '#a01045',
      eye: '#000',
      outline: '#0a0512'
    }
  },

  kira: {
    id: 'kira',
    name: 'KIRA NEON',
    title: 'Cyber Ninja',
    hp: 95,
    speed: 5.2,
    jumpPower: 16,
    punchDmg: 6,
    kickDmg: 9,
    specialName: 'SHADOW STRIKE',
    // Double tap forward + punch (dash attack)
    specialSequence: ['right', 'right', 'punch'],
    specialDmg: 22,
    specialCost: 40,
    specialColor: '#00f0ff',
    palette: {
      skin: '#e8c89a',
      skinDark: '#b89070',
      gi: '#1a0a3e',         // dark ninja gi
      giShadow: '#0a0420',
      belt: '#00f0ff',       // cyan belt
      hair: '#b537f2',       // purple hair
      hairHighlight: '#ff1f6d',
      accent: '#00f0ff',     // cyan visor
      accentDark: '#0090a0',
      eye: '#fff',
      outline: '#0a0512'
    }
  },

  brick: {
    id: 'brick',
    name: 'BRICK STONE',
    title: 'The Street Brawler',
    hp: 165,
    speed: 2.8,
    jumpPower: 11,
    punchDmg: 12,
    kickDmg: 15,
    specialName: 'EARTHQUAKE',
    // Double tap down + kick
    specialSequence: ['down', 'down', 'kick'],
    specialDmg: 32,
    specialCost: 60,
    specialColor: '#ff7a00',
    palette: {
      skin: '#d8a878',
      skinDark: '#a87848',
      gi: '#7a3a1a',         // brown leather
      giShadow: '#4a2010',
      belt: '#ffd23f',       // gold buckle
      hair: '#d4a040',       // blonde
      hairHighlight: '#ffd23f',
      accent: '#3a3a3a',     // dark torn jeans
      accentDark: '#1a1a1a',
      eye: '#000',
      outline: '#0a0512'
    }
  }
};

// Enemy palette + def
const ENEMIES = {
  thug: {
    id: 'thug',
    name: 'THUG',
    hp: 35,
    speed: 1.8,
    punchDmg: 6,
    score: 100,
    palette: {
      skin: '#c89070',
      skinDark: '#a06848',
      gi: '#3a3a4a',         // dark grey shirt
      giShadow: '#1a1a2a',
      belt: '#1a1a1a',
      hair: '#000',
      hairHighlight: '#222',
      accent: '#ff1f6d',     // pink mohawk highlights
      accentDark: '#a01045',
      eye: '#ff1f6d',
      outline: '#0a0512'
    }
  },
  brawler: {
    id: 'brawler',
    name: 'BRAWLER',
    hp: 60,
    speed: 1.4,
    punchDmg: 9,
    score: 200,
    palette: {
      skin: '#d8a880',
      skinDark: '#a87848',
      gi: '#5a2a1a',
      giShadow: '#2a1008',
      belt: '#1a1a1a',
      hair: '#1a1a1a',
      hairHighlight: '#3d3d3d',
      accent: '#ffd23f',
      accentDark: '#a08020',
      eye: '#ff0000',
      outline: '#0a0512'
    }
  },
  boss: {
    id: 'boss',
    name: 'BOSS',
    hp: 180,
    speed: 2.0,
    punchDmg: 14,
    score: 1000,
    palette: {
      skin: '#a8c890',         // sickly green
      skinDark: '#688060',
      gi: '#1a0a2e',           // black robes
      giShadow: '#000',
      belt: '#b537f2',         // purple sash
      hair: '#fef5e7',         // white hair
      hairHighlight: '#fff',
      accent: '#ff1f6d',
      accentDark: '#a01045',
      eye: '#ff1f6d',
      outline: '#0a0512'
    }
  }
};

// =============================================================
// SPRITE RENDERER
// Draws characters using their palette. No external assets.
// All characters are drawn at a base size of 64x96 px
// (pixelated, scaled by the canvas).
// =============================================================

function drawFighter(ctx, x, y, facing, state, char, frameTick) {
  // x, y = center-bottom (feet) position on canvas
  // facing = 1 (right) or -1 (left)
  // state = { action, attackTime, hurtTime, jumpY, blocking, walking }
  // char = entry from CHARACTERS or ENEMIES
  const p = char.palette;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing < 0) ctx.scale(-1, 1);

  // bobbing while walking
  const bob = state.walking ? Math.sin(frameTick * 0.25) * 1.5 : 0;
  // jump offset
  const jy = state.jumpY || 0;

  // SHADOW
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, -2, 22 - jy * 0.3, 5 - jy * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -jy + bob);

  // ============ LEGS ============
  // Stance changes during attacks
  let legSpread = state.walking ? Math.sin(frameTick * 0.25) * 4 : 2;
  if (state.action === 'kick') legSpread = 8;
  if (state.action === 'special') legSpread = 6;
  if (state.blocking) legSpread = 3;

  // back leg
  px(ctx, -8 - legSpread, -36, 8, 28, p.gi);
  px(ctx, -8 - legSpread, -36, 8, 4, p.giShadow);
  // front leg (extended on kick)
  if (state.action === 'kick') {
    // extended forward kick
    px(ctx, 4, -50, 26, 8, p.gi);
    px(ctx, 4, -50, 26, 3, p.giShadow);
    // foot
    px(ctx, 28, -52, 8, 12, p.belt);
  } else {
    px(ctx, 0 + legSpread, -36, 8, 28, p.gi);
    px(ctx, 0 + legSpread, -36, 8, 4, p.giShadow);
    // shoes
    px(ctx, -10 - legSpread, -10, 12, 6, p.belt);
    px(ctx, -2 + legSpread, -10, 12, 6, p.belt);
  }

  // ============ TORSO ============
  // hurt flash
  let hurtFlash = state.hurtTime > 0 && Math.floor(frameTick / 2) % 2 === 0;
  let torsoColor = hurtFlash ? '#fff' : p.gi;
  let torsoShadow = hurtFlash ? '#fff' : p.giShadow;

  // main body
  px(ctx, -14, -64, 28, 30, torsoColor);
  // chest shadow
  px(ctx, -14, -64, 28, 6, torsoShadow);
  px(ctx, -14, -40, 28, 4, torsoShadow);
  // belt
  px(ctx, -14, -40, 28, 4, p.belt);
  // accent stripe (varies per character)
  px(ctx, -2, -64, 4, 30, p.accent);

  // ============ ARMS ============
  // back arm
  px(ctx, -18, -62, 6, 22, p.gi);
  px(ctx, -18, -42, 6, 4, p.skin); // back hand

  // front arm depends on action
  if (state.action === 'punch') {
    // arm extended forward
    px(ctx, 12, -60, 24, 6, p.gi);
    px(ctx, 12, -60, 24, 2, p.giShadow);
    // fist
    px(ctx, 32, -62, 8, 10, p.skin);
    px(ctx, 32, -62, 8, 3, p.skinDark);
    // impact star
    if (state.attackTime < 8) {
      drawStar(ctx, 42, -57, 6, p.accent);
    }
  } else if (state.action === 'special') {
    // big windup punch with energy
    px(ctx, 10, -62, 28, 8, p.gi);
    px(ctx, 36, -64, 12, 12, p.skin);
    // energy aura
    ctx.fillStyle = char.specialColor || p.accent;
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 5; i++) {
      const r = 8 + Math.sin(frameTick * 0.3 + i) * 3;
      px(ctx, 38 + i * 2, -64 + Math.sin(frameTick * 0.4 + i) * 4, r, r, char.specialColor);
    }
    ctx.globalAlpha = 1;
  } else if (state.blocking) {
    // both arms up crossed
    px(ctx, -16, -56, 8, 16, p.gi);
    px(ctx, -8, -64, 16, 6, p.gi);
    px(ctx, 8, -56, 8, 16, p.gi);
  } else {
    // idle/walk arm
    const armSwing = state.walking ? Math.sin(frameTick * 0.25) * 3 : 0;
    px(ctx, 10, -62 + armSwing, 6, 22, p.gi);
    px(ctx, 10, -42 + armSwing, 6, 4, p.skin);
  }

  // ============ HEAD ============
  // neck
  px(ctx, -4, -68, 8, 4, p.skinDark);
  // head shape
  px(ctx, -10, -86, 20, 20, p.skin);
  // hair top
  px(ctx, -12, -90, 24, 8, p.hair);
  // hair side
  px(ctx, -12, -82, 4, 12, p.hair);
  px(ctx, -10, -86, 4, 4, p.hairHighlight);
  // headband / accent
  px(ctx, -12, -78, 24, 3, p.accent);
  // ears
  px(ctx, -12, -76, 2, 4, p.skinDark);
  px(ctx, 10, -76, 2, 4, p.skinDark);

  // eyes
  if (state.hurtTime > 0) {
    // X eyes
    drawX(ctx, -5, -73, 3, p.outline);
    drawX(ctx, 3, -73, 3, p.outline);
  } else {
    px(ctx, -5, -74, 3, 3, p.eye);
    px(ctx, 2, -74, 3, 3, p.eye);
  }

  // mouth (changes with action)
  if (state.action === 'punch' || state.action === 'kick' || state.action === 'special') {
    // open shouting mouth
    px(ctx, -3, -70, 6, 3, p.outline);
  } else {
    px(ctx, -2, -70, 4, 1, p.outline);
  }

  // BLOCK aura
  if (state.blocking) {
    ctx.strokeStyle = 'rgba(0,240,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -50, 28 + Math.sin(frameTick * 0.3) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// pixel rect helper (with crisp pixels)
function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawStar(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x - size, y - 1, size * 2, 2);
  ctx.fillRect(x - 1, y - size, 2, size * 2);
  ctx.fillRect(x - size + 2, y - size + 2, 2, 2);
  ctx.fillRect(x + size - 4, y - size + 2, 2, 2);
}

function drawX(ctx, x, y, size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x + size, y - size);
  ctx.lineTo(x - size, y + size);
  ctx.stroke();
}

// =============================================================
// PORTRAIT renderer (used on character select)
// =============================================================
function renderPortrait(canvas, charKey) {
  const char = CHARACTERS[charKey];
  if (!char) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.imageSmoothingEnabled = false;

  // bg gradient based on character
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, char.palette.accent);
  grad.addColorStop(1, char.palette.outline);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // diagonal stripes
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#fff';
  for (let i = -h; i < w; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.lineTo(i + h + 8, h);
    ctx.lineTo(i + 8, 0);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // big fighter portrait (just upper body, scaled)
  ctx.save();
  ctx.translate(w / 2, h * 0.95);
  ctx.scale(1.8, 1.8);
  drawFighter(ctx, 0, 0, 1, { walking: false, action: 'idle', hurtTime: 0, blocking: false }, char, 0);
  ctx.restore();
}

// Build portrait canvases on character select cards
function initPortraits() {
  document.querySelectorAll('[data-portrait]').forEach(el => {
    const charKey = el.dataset.portrait;
    const cnv = document.createElement('canvas');
    cnv.width = 200; cnv.height = 200;
    cnv.style.width = '100%';
    cnv.style.height = '100%';
    cnv.style.imageRendering = 'pixelated';
    el.appendChild(cnv);
    renderPortrait(cnv, charKey);
  });
}
