#!/usr/bin/env node
/**
 * MEYARET smoke tests — syntax, modules, HTML shells.
 * Does NOT import server/index.js (that would start listen + bot).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const results = { pass: [], fail: [] };

function ok(msg) { results.pass.push(msg); }
function fail(msg, err) { results.fail.push({ msg, err: err?.message || err }); }

function nodeCheck(fileRel) {
  const p = path.join(ROOT, fileRel);
  execSync(`node --check "${p}"`, { stdio: 'pipe' });
}

console.log('\n--- 1. Core files exist ---');
const required = [
  'server/index.js', 'server/supabase.js', 'public/game.js', 'public/db.js', 'public/sounds.js',
  'public/index.html', 'public/style.css', 'public/config.js',
];
for (const f of required) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) ok(`exists: ${f}`);
  else fail(`missing: ${f}`);
}

console.log('\n--- 2. JS syntax (node --check) ---');
const checkFiles = [
  'server/index.js', 'server/supabase.js', 'public/game.js', 'public/db.js', 'public/sounds.js',
  'server/routes/users.js', 'server/routes/scores.js', 'server/routes/store.js',
  'server/middleware/auth.js', 'server/weeklyEvent.js',
];
for (const f of checkFiles) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  try {
    nodeCheck(f);
    ok(`syntax: ${f}`);
  } catch (e) {
    fail(`syntax: ${f}`, e);
  }
}

console.log('\n--- 3. Browser modules load in Node (db only; sounds needs window) ---');
try {
  await import(pathToFileURL(path.join(ROOT, 'public/db.js')).href);
  ok('import: public/db.js');
} catch (e) {
  fail('import: public/db.js', e);
}
ok('skip import: public/sounds.js (browser Web Audio)');

console.log('\n--- 4. db.js exports ---');
try {
  const db = await import(pathToFileURL(path.join(ROOT, 'public/db.js')).href);
  const reqExports = [
    'CATALOG', 'dbGetOrCreateUser', 'dbSaveScore', 'dbGetLeaderboard',
    'dbOpenGift', 'dbGiftStatus', 'dbBuyItem', 'dbGrantUpgrade',
  ];
  for (const ex of reqExports) {
    if (typeof db[ex] !== 'undefined') ok(`db.${ex}`);
    else fail(`db missing export: ${ex}`);
  }
} catch (e) {
  fail('db module', e);
}

console.log('\n--- 5. HTML structure ---');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const ids = [
  'game-canvas', 'loading-screen', 'loading-status', 'menu-screen',
  'gift-4hr-screen', 'btn-play', 'gameover-screen', 'mode-select-modal',
];
for (const id of ids) {
  if (html.includes(`id="${id}"`) || html.includes(`id='${id}'`)) ok(`html#${id}`);
  else fail(`html missing #${id}`);
}
if (html.includes('type="module"') && html.includes('game.js')) ok('html module game.js');
else fail('html missing module game.js');

console.log('\n--- 6. Server routes (static scan) ---');
const serverIndex = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
for (const r of ['/api/users', '/api/scores', '/api/store', '/api/config', '/health']) {
  if (serverIndex.includes(r)) ok(`route ${r}`);
  else fail(`missing ${r}`);
}

console.log('\n========== SUMMARY ==========');
console.log(`PASS: ${results.pass.length}`);
console.log(`FAIL: ${results.fail.length}`);
if (results.fail.length > 0) {
  console.log('\nFAILURES:');
  results.fail.forEach(({ msg, err }) => console.log(`  - ${msg}: ${err}`));
  process.exit(1);
}
console.log('All tests passed.\n');
process.exit(0);
