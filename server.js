'use strict';
// my-game: a Slop Box game. Plain Node, no dependencies.
//
// The template's demo game is a buzzer: phones join with a name and race to buzz, and the TV shows the
// join QR code, the players and who buzzed first. Replace the game part; keep the plumbing.
//
// Slop Box contract (GAME_CONTRACT.md in slop-box/slopboxhub):
//   listens on $PORT · phones at / · TV at /tv (optional) · GET /healthz · URLs from location.origin
// Live updates use server-sent events (GET /events) and actions use POST /action. Both are "background
// requests", so the party gate never cuts them off mid-round.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QR = require('./qr');

const PORT = Number(process.env.PORT) || 3000;
// Optional: force the join address shown on the TV. By default the TV uses the address it opened.
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- game state (replace with your game) ----------

// Each phone keeps a secret key in localStorage. Other players only ever see a short public id
// derived from it, so nobody can act as someone else.
const publicId = (key) => crypto.createHash('sha256').update(key).digest('hex').slice(0, 10);

const state = {
  players: new Map(), // public id -> { name, streams: number of open /events connections }
  buzzedBy: null,     // public id of the first buzz this round
  round: 1,
};

function view() {
  return {
    players: [...state.players].map(([id, p]) => ({ id, name: p.name, connected: p.streams > 0 })),
    buzzedBy: state.buzzedBy,
    round: state.round,
    publicUrl: PUBLIC_URL || null,
  };
}

function handleAction(a) {
  const key = typeof a.key === 'string' && a.key.length >= 16 && a.key.length <= 64 ? a.key : null;
  switch (a.type) {
    case 'join': {
      if (!key) throw new Error('Missing player key');
      const name = String(a.name || '').trim().slice(0, 20);
      if (!name) throw new Error('Pick a name');
      const id = publicId(key);
      // The phone usually opened its live-update stream before joining, so count it now.
      let open = 0;
      for (const s of streams) if (s.playerId === id) open++;
      state.players.set(id, { name, streams: open });
      return { id };
    }
    case 'buzz': {
      if (!key) throw new Error('Missing player key');
      const id = publicId(key);
      if (!state.players.has(id)) throw new Error('Join first');
      if (!state.buzzedBy) state.buzzedBy = id;
      return {};
    }
    case 'next': // sent by the TV. A real game might check who's allowed to do this.
      state.buzzedBy = null;
      state.round++;
      return {};
    default:
      throw new Error('Unknown action');
  }
}

// ---------- live updates (server-sent events) ----------

const streams = new Set(); // { res, playerId }

function broadcast() {
  const msg = `data: ${JSON.stringify(view())}\n\n`;
  for (const s of streams) s.res.write(msg);
}

function openStream(req, res, url) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no', // tell proxies not to hold events back
    Connection: 'keep-alive',
  });
  res.write('retry: 2000\n\n');
  const key = url.searchParams.get('key');
  const playerId = key ? publicId(key) : null;
  const s = { res, playerId };
  streams.add(s);
  const p = playerId && state.players.get(playerId);
  if (p) p.streams++;
  broadcast();
  req.on('close', () => {
    streams.delete(s);
    const q = playerId && state.players.get(playerId);
    if (q) q.streams = Math.max(0, q.streams - 1);
    broadcast();
  });
}

// Comment lines every 15 s keep idle connections open through Cloudflare and Caddy.
setInterval(() => { for (const s of streams) s.res.write(':\n\n'); }, 15000);

// ---------- HTTP ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};
const ROUTES = { '/': 'index.html', '/tv': 'tv.html' }; // delete '/tv' for a phone-only game

function serveStatic(res, pathname) {
  const rel = ROUTES[pathname] || pathname.slice(1);
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return res.writeHead(404).end('Not found');
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function readJson(req, cb) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
  req.on('end', () => { try { cb(null, JSON.parse(body)); } catch (e) { cb(e); } });
}

const qrCache = new Map();
function serveQr(res, text) {
  if (!/^https?:\/\//.test(text) || text.length > 200) return res.writeHead(400).end('Bad QR text');
  if (!qrCache.has(text)) {
    if (qrCache.size > 20) qrCache.clear();
    qrCache.set(text, QR.toSvg(text));
  }
  res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' }).end(qrCache.get(text));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/action') {
    return readJson(req, (err, a) => {
      let out;
      try {
        if (err || !a || typeof a !== 'object') throw new Error('Bad request');
        out = Object.assign({ ok: true }, handleAction(a));
        broadcast();
      } catch (e) {
        out = { ok: false, error: e.message };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
    });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
  // Slop Box lets /healthz through even while games are closed, so you can check which commit is live.
  if (url.pathname === '/healthz') {
    return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      .end(JSON.stringify({ ok: true, version: process.env.GIT_SHA || 'dev' }));
  }
  if (url.pathname === '/events') return openStream(req, res, url);
  if (url.pathname === '/qr.svg') return serveQr(res, url.searchParams.get('u') || '');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return res.writeHead(400).end('Bad request'); }
  serveStatic(res, p);
});

server.listen(PORT, () => {
  console.log(`my-game is running on :${PORT}`);
  console.log(`  Phones: http://localhost:${PORT}/   TV: http://localhost:${PORT}/tv`);
});

// Node as PID 1 ignores SIGTERM by default, which makes `docker stop` wait 10 s.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { for (const s of streams) s.res.end(); server.close(() => process.exit(0)); });
