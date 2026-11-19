'use strict';
// Renames the template's placeholder id ("my-game") to your game's id everywhere it appears.
// Usage: npm run set-id -- space-lawyers

const fs = require('fs');
const path = require('path');

const PLACEHOLDER = 'my-game';
const RESERVED = ['hub', 'www', 'caddy'];
const FILES = [
  'package.json',
  'server.js',
  'README.md',
  '.github/workflows/publish.yml',
  'public/index.html',
  'public/tv.html',
];

const id = (process.argv[2] || '').trim();
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
  console.error('Usage: npm run set-id -- <id>');
  console.error('The id is lowercase letters, digits and single hyphens, e.g. space-lawyers.');
  process.exit(1);
}
if (RESERVED.includes(id)) {
  console.error(`"${id}" is taken by Slop Box itself. Pick another id.`);
  process.exit(1);
}

const root = path.join(__dirname, '..');
let changed = 0;
for (const rel of FILES) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue; // e.g. tv.html deleted for a phone-only game
  const before = fs.readFileSync(file, 'utf8');
  const after = before.split(PLACEHOLDER).join(id);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed++;
    console.log(`  updated ${rel}`);
  }
}
console.log(changed ? `Done: the game id is now "${id}".` : `Nothing to change (already renamed?).`);
console.log(`Check games.json in slop-box/slopboxhub to make sure no other game uses "${id}".`);
