import assert from 'node:assert/strict';
import { fresh, terrain, SIZE, validate, gather } from './engine.js';
import { findPath, advanceHero, revealAround, walkable } from './navigation.js';
const s = fresh();
assert.equal(SIZE, 41);
assert.ok(
  Array.from({ length: SIZE * SIZE }, (_, i) => terrain(i % SIZE, Math.floor(i / SIZE))).filter(
    (t) => t !== 'water',
  ).length > 1000,
);
assert.equal(findPath(s, s.hero, { x: 20, y: 20 }), null);
s.unlocked.push('main');
let path = findPath(s, s.hero, { x: 20, y: 20 });
assert.ok(path && path.length > 20);
assert.ok(path.every((p) => walkable(s, p.x, p.y)));
let previous = s.hero;
for (const p of path) {
  assert.equal(Math.abs(p.x - previous.x) + Math.abs(p.y - previous.y), 1);
  previous = p;
}
for (let i = 0; i < 3000 && path.length; i++) advanceHero(s, path, 0.1);
assert.equal(path.length, 0);
assert.equal(s.hero.x, 20);
assert.equal(s.hero.y, 20);
const before = s.revealed.length;
assert.ok(revealAround(s, s.hero, 4) > 0);
assert.ok(s.revealed.length > before);
assert.equal(revealAround(s, s.hero, 4), 0);
assert.equal(findPath(s, s.hero, { x: 40, y: 40 }), null);
const old = fresh();
delete old.hero;
old.buildings.push({ x: 4, y: 5, type: 'lumber' });
validate(old);
assert.ok(walkable(old, old.hero.x, old.hero.y));
assert.equal(old.resources.wood, 65);
assert.equal(old.buildings.length, 2);
const q = fresh();
let resource;
for (let x = 1; x < 10; x++)
  for (let y = 1; y < 10; y++)
    if (
      terrain(x, y) === 'mountain' &&
      q.revealed.includes(`${x},${y}`) &&
      findPath(q, q.hero, { x, y })
    )
      resource = { x, y };
assert.ok(resource);
path = findPath(q, q.hero, resource);
for (let i = 0; i < 1000 && path.length; i++) advanceHero(q, path, 0.1);
assert.equal(Math.abs(q.hero.x - resource.x) + Math.abs(q.hero.y - resource.y), 1);
const stone = q.resources.stone;
assert.equal(gather(q, resource.x, resource.y), true);
assert.equal(q.resources.stone, stone + 3);
assert.deepEqual(validate(JSON.parse(JSON.stringify(q))).hero, q.hero);
console.log(
  'PASS: 1000+ szárazföldi mező, hosszú kerülőút, szomszédos lépések, célba érés, felfedezés, tiltott út, régi mentésből karakter, közelről gyűjtés, pozíciómentés.',
);
