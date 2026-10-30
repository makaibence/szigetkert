import assert from 'node:assert/strict';
import {
  fresh,
  build,
  move,
  tick,
  rates,
  bonus,
  explore,
  gather,
  claim,
  validate,
  terrain,
  CAP,
} from './engine.js';
let s = fresh(Date.now() - 100000000);
assert.equal(validate(JSON.parse(JSON.stringify(s))).version, 5);
assert.equal(build(s, 'lumber', 4, 5), false);
assert.equal(build(s, 'lumber', 5, 4), true);
assert.equal(build(s, 'farm', 5, 4), false);
assert.equal(build(s, 'market', 0, 0), false);
assert.equal(move(s, 1, 4, 4), terrain(4, 4) === 'grass');
let pre = s.resources.food,
  r = rates(s);
tick(s, s.last + 100000);
assert.ok(Math.abs(s.resources.food - pre - r.food * 100) < 1e-6);
pre = s.resources.food;
tick(s, s.last + CAP * 2000);
assert.ok(Math.abs(s.resources.food - pre - r.food * CAP) < 1e-6);
assert.equal(explore(s, 8, 5), true);
assert.equal(explore(s, 10, 0), false);
assert.equal(explore(s, 8, 5), false);
let tile;
for (let x = 3; x <= 7; x++)
  for (let y = 3; y <= 7; y++) if (terrain(x, y) === 'forest') tile = { x, y };
assert.ok(tile);
assert.equal(gather(s, tile.x, tile.y), true);
s.gathered = 10;
assert.equal(claim(s, 'gather'), true);
assert.equal(claim(s, 'gather'), false);
for (const mutate of [
  (q) => (q.version = 99),
  (q) => (q.resources.wood = -1),
  (q) => q.buildings.push({ ...q.buildings[0] }),
  (q) => (q.revealed = ['bad']),
  (q) => (q.last = Infinity),
  (q) => (q.claimed = ['fake']),
]) {
  const q = structuredClone(s);
  mutate(q);
  assert.throws(() => validate(q));
}
let b = { id: 'building:2', level: 1, x: 5, y: 4, type: 'lumber' };
s.buildings = [b, { id: 'building:1', level: 1, x: 5, y: 5, type: 'market' }];
assert.equal(bonus(s, b), 1);
assert.ok(rates(s).gold > 0);
const saved = JSON.stringify(s);
assert.deepEqual(validate(JSON.parse(saved)), s);
console.log(
  'PASS: építés, foglaltság, áthelyezés, termelés, offline korlát, köd, gyűjtés, jutalmak, mentésellenőrzés.',
);
const simple = fresh(Date.now() - 1000);
simple.buildings = [
  { x: 4, y: 5, type: 'lumber' },
  { x: 5, y: 5, type: 'market' },
];
assert.equal(rates(simple).wood, 0.12);
simple.buildings = [{ x: 5, y: 4, type: 'lumber' }];
assert.equal(rates(simple).wood, 0.12);
const legacy = fresh();
legacy.claimed = ['bonus'];
assert.equal(validate(legacy).claimed[0], 'bonus');
assert.equal(claim(legacy, 'bonus'), false);
console.log(
  'PASS: az erdő/hegy/piac nem módosítja a termelést; a korábbi bónuszküldetés mentése kompatibilis.',
);
