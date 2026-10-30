import assert from 'node:assert/strict';
import {
  fresh,
  validate,
  harvestHit,
  resourcesAt,
  terrainAt,
  build,
  placement,
  resourceTarget,
} from './engine.js';
import { loadGame, saveGame, importGame, STORE, BACKUP } from './save.js';
import { walkable } from './navigation.js';
class MemoryStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(k) {
    return this.values.get(k) ?? null;
  }
  setItem(k, v) {
    this.values.set(k, v);
  }
}
const old = fresh();
old.version = 1;
delete old.resourceState;
delete old.unlocked;
delete old.nextBuildingId;
for (const b of old.buildings) {
  delete b.id;
  delete b.level;
}
const original = JSON.stringify(old),
  storage = new MemoryStorage();
storage.setItem(STORE, original);
const loaded = loadGame(storage);
assert.equal(loaded.state.version, 8);
assert.equal(storage.getItem(BACKUP), original);
assert.equal(storage.getItem(STORE), original);
assert.deepEqual(loaded.state.resources, old.resources);
assert.equal(loaded.state.buildings[0].id, 'building:1');
saveGame(loaded.state, storage);
assert.equal(JSON.parse(storage.getItem(STORE)).version, 8);
assert.equal(storage.getItem(BACKUP), original);
const s = fresh();
let target;
for (let x = 3; x <= 7; x++)
  for (let y = 3; y <= 7; y++)
    if (resourcesAt(x, y).some((r) => r.kind === 'wood')) target = { x, y };
assert.ok(target);
const node = resourceTarget(s, target.x, target.y);
target.resourceId = node.id;
const wood = s.resources.wood;
assert.equal(harvestHit(s, target).finished, false);
assert.equal(s.resources.wood, wood + 1);
const roundtrip = importGame(JSON.stringify(s));
assert.equal(roundtrip.resourceState[node.id].hitsLeft, node.hits - 1);
assert.equal(harvestHit(roundtrip, target).finished, false);
assert.equal(harvestHit(roundtrip, target).finished, false);
assert.equal(roundtrip.resources.wood, wood + 3);
while (!roundtrip.resourceState[node.id]?.cleared) harvestHit(roundtrip, target);
assert.equal(roundtrip.resources.wood, wood + node.hits);
assert.equal(harvestHit(roundtrip, target).ok, false);
assert.equal(roundtrip.resources.wood, wood + node.hits);
for (const other of resourcesAt(target.x, target.y)) {
  while (!roundtrip.resourceState[other.id]?.cleared)
    harvestHit(roundtrip, { ...target, resourceId: other.id });
}
assert.equal(terrainAt(roundtrip, target.x, target.y), 'grass');
assert.equal(walkable(roundtrip, target.x, target.y), true);
assert.equal(placement(roundtrip, target.x, target.y).ok, true);
assert.equal(build(roundtrip, 'hut', target.x, target.y), true);
const id = roundtrip.buildings.at(-1).id;
assert.equal(validate(JSON.parse(JSON.stringify(roundtrip))).buildings.at(-1).id, id);
const corrupt = JSON.parse(JSON.stringify(roundtrip));
corrupt.buildings[1].id = corrupt.buildings[0].id;
assert.throws(() => validate(corrupt));
const invalid = new MemoryStorage();
invalid.setItem(STORE, 'broken');
assert.equal(loadGame(invalid).writable, false);
assert.equal(invalid.getItem(STORE), 'broken');
console.log(
  'PASS: v1→v5 mentésmigráció, eredeti biztonsági másolat, stabil épületazonosítók, tartós nyersanyagkészlet, részleges és végleges kitermelés mentése, ismételt jóváírás tiltása, felszabaduló építési hely, sérült mentés védelme.',
);
