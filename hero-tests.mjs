import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fresh } from './engine.js';
import { findPath, smoothPath, lineClear, advanceHero } from './navigation.js';
const root = new URL('./assets/character/', import.meta.url);
function glbJSON(raw) {
  assert.equal(raw.toString('ascii', 0, 4), 'glTF');
  return JSON.parse(raw.toString('utf8', 20, 20 + raw.readUInt32LE(12)));
}
for (const part of ['base', 'outfit', 'hair']) {
  const data = JSON.parse(await fs.readFile(new URL(`${part}/${part}.gltf`, root), 'utf8'));
  const names = new Set(data.nodes.map((n) => n.name));
  assert.ok(names.has('Head'));
  assert.ok(names.has('hand_r'));
  assert.ok(names.has('foot_l'));
  assert.ok(data.skins.every((s) => s.joints.length === 65));
  for (const file of [...data.images, ...data.buffers]) {
    assert.ok(!file.uri.startsWith('http'));
    await fs.access(new URL(`${part}/${file.uri}`, root));
  }
}
const locomotion = glbJSON(await fs.readFile(new URL('animations.glb', root))),
  work = glbJSON(await fs.readFile(new URL('animations-harvest.glb', root)));
assert.ok(locomotion.animations.some((a) => a.name === 'Idle_Loop'));
assert.ok(locomotion.animations.some((a) => a.name === 'Walk_Loop'));
const chop = work.animations.find((a) => a.name === 'TreeChopping_Loop');
assert.ok(chop);
const duration = Math.max(...chop.samplers.map((s) => work.accessors[s.input].max[0]));
assert.ok(Math.abs(duration - 0.966667) < 0.00001);
assert.ok(
  chop.channels.some(
    (c) => work.nodes[c.target.node].name === 'hand_r' && c.target.path === 'rotation',
  ),
);
const s = fresh();
s.unlocked.push('main');
const target = { x: 20, y: 20 },
  raw = findPath(s, s.hero, target),
  smooth = smoothPath(s, s.hero, raw);
assert.ok(smooth.length < raw.length);
let from = s.hero;
for (const p of smooth) {
  assert.ok(lineClear(s, from, p));
  from = p;
}
for (let i = 0; i < 4000 && smooth.length; i++) advanceHero(s, smooth, 0.1);
assert.equal(s.hero.x, 20);
assert.equal(s.hero.y, 20);
assert.ok(Number.isFinite(s.hero.targetAngle));
console.log(
  'PASS: helyi riggelt glTF-részek és textúrák, 65 csont egyezése, járás/alapállás, valódi favágóklip, találati időzítés alapja, folyamatosan irányuló simított útvonal.',
);
