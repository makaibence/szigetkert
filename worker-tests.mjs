import assert from 'node:assert/strict';
import { fresh, build, move, upgrade, upgradeCost, validate, tick, CAP } from './engine.js';
import { syncWorkers, updateWorkers, produceOfflineWorkers, findWork } from './workers.js';
const s = fresh();
s.resources = { ...s.resources, wood: 1000, stone: 1000, food: 1000, gold: 1000 };
assert.ok(build(s, 'lumber', 5, 4));
syncWorkers(s);
const worker = s.workers[0],
  start = s.resources.wood;
assert.equal(s.workers.length, 1);
assert.ok(findWork(s, worker));
let seenWork = false,
  seenCarry = false;
for (let i = 0; i < 1200; i++) {
  updateWorkers(s, 0.1);
  seenWork ||= worker.action === 'chop';
  if (worker.carried) {
    seenCarry = true;
    assert.ok(s.resources.wood >= start);
  }
}
assert.ok(seenWork && seenCarry);
assert.ok(s.resources.wood > start);
const pending = structuredClone(s);
pending.workers[0].carried = 2;
pending.workers[0].phase = 'returning';
const restored = validate(JSON.parse(JSON.stringify(pending))),
  before = restored.resources.wood;
for (let i = 0; i < 300 && restored.workers[0].carried; i++) updateWorkers(restored, 0.1);
assert.equal(restored.workers[0].carried, 0);
assert.equal(restored.resources.wood, before + 2);
const id = s.buildings[1].id;
assert.ok(upgradeCost(s.buildings[1]));
assert.ok(upgrade(s, id));
syncWorkers(s);
assert.equal(s.workers.length, 2);
assert.ok(upgrade(s, id));
syncWorkers(s);
assert.equal(s.workers.length, 3);
assert.equal(upgrade(s, id), false);
assert.equal(upgradeCost(s.buildings[1]), null);
assert.ok(move(s, 1, 4, 4));
assert.equal(s.buildings[1].id, id);
assert.equal(s.buildings[1].level, 3);
assert.deepEqual(validate(JSON.parse(JSON.stringify(s))).workers, s.workers);
const blocked = fresh();
blocked.buildings = [{ id: 'building:1', type: 'lumber', x: 5, y: 5, level: 1 }];
blocked.revealed = ['5,5', '4,5'];
syncWorkers(blocked);
const count = blocked.resources.wood;
for (let i = 0; i < 200; i++) updateWorkers(blocked, 0.1);
produceOfflineWorkers(blocked, 3600);
assert.equal(blocked.resources.wood, count);
const offline = fresh();
offline.resources.wood = 100;
assert.ok(build(offline, 'lumber', 5, 4));
const pre = offline.resources.wood,
  seconds = tick(offline, offline.last + CAP * 2000, false);
assert.equal(seconds, CAP);
assert.equal(offline.resources.wood, pre);
produceOfflineWorkers(offline, seconds);
assert.ok(offline.resources.wood > pre);
assert.ok(offline.resources.wood <= pre + 0.12 * CAP + 1);
assert.ok(Object.values(offline.resourceState).some((v) => v.cleared));
const legacy = structuredClone(s);
legacy.version = 2;
delete legacy.workers;
const migrated = validate(legacy);
assert.equal(migrated.version, 9);
assert.deepEqual(migrated.workers, []);
console.log(
  'PASS: valódi munkáskör, visszahozott készlet, mentett rakomány, akadályozott termelés, véges távolléti kitermelés, 3 fejlesztési szint, 1–3 munkás, áthelyezéskor megőrzött azonosító és szint, v2→v5 migráció.',
);
