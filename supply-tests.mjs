import assert from 'node:assert/strict';
import { fresh, rates, tick, buildingRate } from './engine.js';
import {
  freshAdventure,
  inspectSite,
  restoreSite,
  validateCampaign,
  inspectDiscovery,
  maybeEvent,
  eventView,
  switchCampaign,
} from './adventure.js';
import { findPath, revealAround } from './navigation.js';
import { ensureSupply, beginMeal, recoverWorker, supplySummary } from './supply.js';
import { updateWorkers, produceOfflineWorkers, syncWorkers } from './workers.js';
import { loadGame, STORE } from './save.js';
function visit(s, id) {
  const p = s.adventure.sites.find((p) => p.id === id);
  revealAround(s, p, 2);
  const path = findPath(s, s.hero, p);
  assert.ok(path, `${id}: reachable`);
  Object.assign(s.hero, path.at(-1) || s.hero);
  return inspectSite(s, id);
}
const s = freshAdventure();
assert.equal(s.resources.food, 0);
const before = { ...s.resources };
assert.ok(visit(s, 'camp').ok);
const after = { ...s.resources };
assert.equal(after.food - before.food, 12);
assert.equal(after.wood - before.wood, 30);
assert.ok(visit(s, 'camp').ok);
assert.deepEqual(s.resources, after);
assert.ok(restoreSite(s, 'camp'));
assert.equal(rates(s).food, 0);
const food = s.resources.food;
tick(s, s.last + 60000, false);
assert.equal(s.resources.food, food);
assert.ok(visit(s, 'garden').ok);
assert.ok(restoreSite(s, 'garden'));
assert.ok(s.adventure.sites.find((p) => p.id === 'garden').x < 15);
assert.equal(rates(s).food, 4 / 60);
assert.ok(!s.unlocked.includes('main'));
assert.ok(visit(s, 'lumber').ok);
assert.ok(restoreSite(s, 'lumber'));
const forage = s.adventure.sites.find((p) => p.kind === 'forage');
assert.ok(visit(s, forage.id).ok);
const picked = s.resources.food;
visit(s, forage.id);
assert.equal(s.resources.food, picked);
s.adventure.playTime += 30;
visit(s, forage.id);
assert.equal(s.resources.food, picked + 3);
syncWorkers(s);
const w = s.workers[0];
w.energy = 0;
s.resources.food = 4;
beginMeal(s, w);
assert.equal(s.resources.food, 2);
const serial = validateCampaign(JSON.parse(JSON.stringify(s)));
const rw = serial.workers[0];
recoverWorker(rw, 10);
const paid = serial.resources.food;
beginMeal(serial, rw);
assert.equal(serial.resources.food, paid);
recoverWorker(rw, 10);
assert.equal(rw.energy, 100);
assert.equal(rw.recovery, undefined);
const hungry = structuredClone(s);
hungry.resources.food = 0;
hungry.workers[0].energy = 0;
delete hungry.workers[0].recovery;
beginMeal(hungry, hungry.workers[0]);
assert.equal(hungry.workers[0].recovery.total, 40);
assert.ok(hungry.economy.supply < 100);
recoverWorker(hungry.workers[0], 40);
assert.equal(hungry.workers[0].energy, 55);
const energy = hungry.workers[0].energy,
  supply = hungry.economy.supply;
produceOfflineWorkers(hungry, 3600);
assert.equal(hungry.workers[0].energy, energy);
assert.equal(hungry.economy.supply, supply);
assert.ok(hungry.resources.food >= 0);
const summary = supplySummary(serial);
assert.equal(summary.production, 4);
assert.equal(summary.demand, 1);
assert.equal(summary.total, summary.working + summary.resting + summary.waiting);
// Reading a clue cannot remotely claim the physical discovery.
s.adventure.pending = { id: 'event:999', type: 'tide', variant: 0, target: { x: 11, y: 12 } };
const loot = { ...s.resources };
eventView(s);
assert.deepEqual(s.resources, loot);
assert.equal(inspectDiscovery(s).ok, false);
revealAround(s, s.adventure.pending.target, 2);
Object.assign(s.hero, s.adventure.pending.target);
assert.ok(inspectDiscovery(s).ok);
const once = { ...s.resources };
assert.equal(inspectDiscovery(s).ok, false);
assert.deepEqual(s.resources, once);
// Corrupted needs are rejected instead of silently becoming full energy.
for (const change of [
  (q) => (q.economy.supply = 101),
  (q) => (q.workers[0].energy = -1),
  (q) =>
    (q.workers[0].recovery = {
      remaining: 500,
      total: 20,
      startEnergy: 0,
      targetEnergy: 100,
      foodPaid: 2,
    }),
]) {
  const bad = structuredClone(s);
  change(bad);
  assert.throws(() => validateCampaign(bad));
}
console.log(
  'PASS: one-time base cache, zero base output, early garden without bridge/grinding, finite foraging, resumable paid meal, hunger and recovery, frozen offline energy, honest supply estimate, physical-only discovery, corrupt energy rejection.',
);
const legacy = fresh();
legacy.version = 4;
const raw4 = JSON.stringify(legacy),
  storage = {
    values: new Map([[STORE, raw4]]),
    getItem(k) {
      return this.values.get(k) || null;
    },
    setItem(k, v) {
      this.values.set(k, v);
    },
  };
const imported = loadGame(storage);
assert.equal(imported.writable, true);
assert.equal(imported.state.version, 9);
assert.equal(storage.getItem('szigetkert.backup.pre-supply-v5'), raw4);
assert.equal(storage.getItem(STORE), raw4);
assert.deepEqual(imported.state.resources, legacy.resources);
const away = switchCampaign(imported.state),
  back = switchCampaign(away);
assert.deepEqual(back.resources, legacy.resources);
assert.deepEqual(back.buildings, legacy.buildings);
assert.equal(validateCampaign(JSON.parse(JSON.stringify(back))).version, 9);
console.log(
  'PASS: v4 raw backup created before writes; supplies and archived old city survive reversible island switching.',
);
const door = structuredClone(s),
  carrier = door.workers[0];
carrier.phase = 'returning';
carrier.x = 8.011266011483837;
carrier.y = 11.497465451366955;
carrier.carried = 3;
carrier.energy = 0;
delete carrier.recovery;
const delivered = door.resources.wood;
for (let i = 0; i < 300 && carrier.carried; i++) updateWorkers(door, 0.1);
assert.equal(carrier.carried, 0);
assert.equal(door.resources.wood, delivered + 3);
console.log(
  'PASS: fractional doorway position reaches the actual entrance and delivers cargo instead of getting stuck in an empty route.',
);
