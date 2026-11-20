'use strict';
// Plays a quick game against a real server: two phones join, both buzz, the first one wins, the TV
// moves to the next round. Runs before every publish (the workflow's test-command). Run: npm test

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const assert = require('assert');

const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(p) {
  return new Promise((resolve, reject) => {
    http.get(BASE + p, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    }).on('error', reject);
  });
}

function act(type, data = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE + '/action', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.end(JSON.stringify(Object.assign({ type }, data)));
  });
}

// Opens /events and keeps the latest state it received.
function watch(query = '') {
  const w = { latest: null, close: () => {} };
  http.get(BASE + '/events' + query, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const event = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = event.split('\n').find((l) => l.startsWith('data: '));
        if (line) w.latest = JSON.parse(line.slice(6));
      }
    });
    w.close = () => res.destroy();
  });
  return w;
}

async function until(fn, what) {
  for (let i = 0; i < 50; i++) { if (fn()) return; await sleep(50); }
  throw new Error('Timed out waiting for ' + what);
}

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: 'ignore',
  });
  const watchers = [];
  try {
    for (let i = 0; i < 50; i++) { try { if ((await get('/healthz')).status === 200) break; } catch {} await sleep(100); }
    assert.deepEqual(JSON.parse((await get('/healthz')).body), { ok: true, version: 'dev' });

    for (const [p, type] of [['/', 'text/html'], ['/tv', 'text/html'], ['/style.css', 'text/css']]) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.ok(r.type.startsWith(type), p);
    }
    assert.ok((await get('/qr.svg?u=' + encodeURIComponent('https://game.example.com/'))).body.startsWith('<svg'));
    assert.equal((await get('/qr.svg?u=javascript:alert(1)')).status, 400);

    const tv = watch();
    const ann = { key: 'a'.repeat(32) }, bob = { key: 'b'.repeat(32) };
    watchers.push(tv, watch('?key=' + ann.key), watch('?key=' + bob.key));

    assert.equal((await act('join', { key: ann.key, name: '' })).ok, false, 'empty name is refused');
    const a = await act('join', Object.assign({ name: 'Ann' }, ann));
    const b = await act('join', Object.assign({ name: 'Bob' }, bob));
    assert.ok(a.ok && b.ok && a.id !== b.id);
    await until(() => tv.latest && tv.latest.players.length === 2 && tv.latest.players.every((p) => p.connected), 'both players connected');
    assert.ok(!JSON.stringify(tv.latest).includes(ann.key), 'player keys are never broadcast');

    await act('buzz', bob);
    await act('buzz', ann);
    await until(() => tv.latest.buzzedBy === b.id, 'Bob to win the buzz');

    await act('next');
    await until(() => tv.latest.round === 2 && tv.latest.buzzedBy === null, 'round 2');

    watchers[2].close();
    await until(() => !tv.latest.players.find((p) => p.id === b.id).connected, 'Bob shown as away after disconnecting');

    console.log('PASS');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    watchers.forEach((w) => w.close());
    server.kill();
  }
}

main();
