const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const { GameEngine } = require('./gameEngine');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const engine = new GameEngine();

// --- HTTP ---
const server = http.createServer(async (req, res) => {
  // Simple routing
  let url = req.url.split('?')[0];

  // API: QR code for a given room code
  if (url.startsWith('/api/qr/')) {
    const code = url.slice('/api/qr/'.length).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!code) { res.writeHead(400); return res.end('bad code'); }
    const host = req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const joinUrl = `${proto}://${host}/?code=${code}`;
    try {
      const dataUrl = await QRCode.toDataURL(joinUrl, { margin: 1, width: 400, color: { dark: '#0a0a0a', light: '#ffffff' } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ qr: dataUrl, joinUrl }));
    } catch (e) {
      res.writeHead(500);
      res.end('qr failed');
    }
    return;
  }

  if (url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(engine.getStats()));
  }

  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  // Static files
  if (url === '/') url = '/index.html';
  if (url === '/host') url = '/host.html';
  if (url === '/player') url = '/player.html';

  // Prevent path traversal
  const safePath = path.normalize(url).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// --- WebSocket ---
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => engine.handleMessage(ws, data.toString()));
  ws.on('close', () => engine.handleDisconnect(ws));
  ws.on('error', () => { /* swallow */ });
});

// Heartbeat to detect dead connections (mobile sleep, network drops)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`[game-platform] listening on :${PORT}`);
  console.log(`  host view:   http://localhost:${PORT}/host`);
  console.log(`  player view: http://localhost:${PORT}/`);
  console.log(`  ws path:     /ws`);
});
