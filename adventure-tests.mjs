import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  freshAdventure,
  prepareCampaign,
  validateCampaign,
  switchCampaign,
  inspectSite,
  restoreSite,
  restoration,
  discoverSites,
  maybeEvent,
  eventView,
  inspectDiscovery,
  traderOffers,
  trade,
  siteCost,
} from './adventure.js';
import { fresh, validate, terrainAt, resourcesAt, resourceTarget, upgrade } from './engine.js';
import { findPath, revealAround, driveHero, walkable, canStand } from './navigation.js';
import { queueGather, advanceGathering } from './gathering.js';
import { loadGame, saveGame, STORE } from './save.js';
import { syncWorkers, updateWorkers, produceOfflineWorkers } from './workers.js';
const s = freshAdventure(Date.now(), 12345);
assert.equal(s.worldVersion, 4);
assert.ok(walkable(s, 2, 10));
assert.equal(s.buildings.length, 0);
assert.deepEqual(validateCampaign(structuredClone(s)), s);
// Main path is reachable, river is a real movement barrier, repaired bridge opens it.
s.adventure.introSeen = true;
s.resources = { ...s.resources, wood: 200, stone: 100, food: 20, gold: 20 };
for (let x = 0; x < 15; x++)
  for (let y = 0; y < 30; y++) if (!s.revealed.includes(`${x},${y}`)) s.revealed.push(`${x},${y}`);
for (const id of ['camp', 'lumber', 'quarry']) {
  const p = s.adventure.sites.find((p) => p.id === id);
  const path = findPath(s, s.hero, p);
  assert.ok(path, `${id} reachable`);
  const end = path.at(-1) || s.hero;
  s.hero.x = end.x;
  s.hero.y = end.y;
  assert.ok(inspectSite(s, id).ok);
  assert.ok(restoration(s, id).ok);
  assert.ok(restoreSite(s, id));
  assert.equal(restoreSite(s, id), false);
}
assert.equal(findPath(s, s.hero, { x: 19, y: 10 }), null);
const bridge = s.adventure.sites.find((p) => p.id === 'bridge'),
  path = findPath(s, s.hero, bridge);
assert.ok(path);
Object.assign(s.hero, path.at(-1));
assert.ok(inspectSite(s, 'bridge').ok);
assert.ok(restoreSite(s, 'bridge'));
assert.equal(terrainAt(s, 14, 12), 'grass');
assert.ok(findPath(s, s.hero, { x: 19, y: 10 }));
// Old city is preserved exactly; changing island is reversible, without nested archive growth.
const old = fresh();
old.version = 3;
old.resources.wood = 777;
old.buildings[0].level = 2;
const legacy = prepareCampaign(validate(structuredClone(old)));
const next = switchCampaign(legacy);
assert.equal(next.worldVersion, 4);
assert.equal(next.archive.resources.wood, 777);
assert.equal(next.archive.buildings[0].level, 2);
const back = switchCampaign(next);
assert.equal(back.resources.wood, 777);
assert.deepEqual(back.buildings, old.buildings);
assert.ok(!back.archive.archive);
assert.deepEqual(validateCampaign(structuredClone(back)), back);
const raw = JSON.stringify(old),
  storage = {
    values: new Map([[STORE, raw]]),
    getItem(k) {
      return this.values.get(k) || null;
    },
    setItem(k, v) {
      this.values.set(k, v);
    },
  };
const loaded = loadGame(storage);
assert.equal(loaded.state.resources.wood, 777);
assert.equal(storage.getItem('szigetkert.backup.pre-adventure'), raw);
assert.equal(storage.getItem(STORE), raw);
// Randomness is persisted; decisions can produce an item/flag rather than only currency.
function eventReady(seed) {
  const q = freshAdventure(Date.now(), seed),
    base = q.adventure.sites.find((p) => p.id === 'camp');
  revealAround(q, base, 2);
  Object.assign(q.hero, findPath(q, q.hero, base).at(-1));
  inspectSite(q, 'camp');
  restoreSite(q, 'camp');
  q.adventure.introSeen = true;
  q.explored = 25;
  return q;
}
const e1 = eventReady(77);
e1.adventure.introSeen = true;
e1.explored = 25;
const e2 = structuredClone(e1);
assert.ok(maybeEvent(e1));
assert.ok(maybeEvent(e2));
assert.deepEqual(e1.adventure.pending, e2.adventure.pending);
const pending = JSON.stringify(e1.adventure.pending);
e1.explored = 999;
assert.equal(maybeEvent(e1), false);
assert.equal(JSON.stringify(e1.adventure.pending), pending);
const event = eventView(e1);
assert.equal(event.choices, undefined);
assert.equal(inspectDiscovery(e1).ok, false);
const actual = e1.adventure.pending.target;
revealAround(e1, actual, 2);
Object.assign(e1.hero, actual);
assert.ok(inspectDiscovery(e1).ok);
assert.equal(inspectDiscovery(e1).ok, false);
assert.ok(e1.adventure.decisions.length);
assert.equal(e1.adventure.pending, null);
const variants = new Set();
for (let seed = 1; seed < 60; seed++) {
  const q = eventReady(seed * 78913);
  q.adventure.introSeen = true;
  q.explored = 20;
  maybeEvent(q);
  variants.add(q.adventure.pending.type + q.adventure.pending.variant);
}
assert.ok(variants.size > 3);
// Joystick's screen-up is screen-up, solid objects cannot be crossed.
const j = freshAdventure();
const start = { ...j.hero };
driveHero(j, { x: 0, y: -1 }, 0.1);
assert.ok(j.hero.x < start.x && j.hero.y < start.y);
for (let i = 0; i < 500; i++) driveHero(j, { x: -1, y: 0 }, 0.1);
assert.ok(canStand(j, j.hero.x, j.hero.y));
// Rapid taps share one bounded job and credit only actual timed impacts.
const g = fresh();
let target;
for (let x = 3; x <= 7; x++)
  for (let y = 3; y <= 7; y++) {
    const n = resourcesAt(x, y).find((n) => n.kind === 'wood');
    if (n && findPath(g, g.hero, { x, y })) target = n;
  }
const gp = findPath(g, g.hero, { x: target.tileX, y: target.tileY });
Object.assign(g.hero, gp.at(-1) || g.hero);
queueGather(g, target);
const job = g.hero.job,
  pre = g.resources.wood;
for (let i = 0; i < 1000; i++) queueGather(g, target);
assert.equal(g.hero.job, job);
assert.equal(job.left, 6);
assert.equal(g.resources.wood, pre);
for (let i = 0; i < 10; i++) advanceGathering(g, 0.1);
assert.ok(g.resources.wood - pre <= 3);
assert.ok(g.resources.wood > pre);
assert.deepEqual(validate(JSON.parse(JSON.stringify(g))).hero.job, g.hero.job);
const saved = JSON.parse(JSON.stringify(s));
assert.ok(validateCampaign(saved));
// Workers physically return inside; idle/no-source workers are not left on the road.
const w = fresh();
w.resources = { ...w.resources, wood: 100, stone: 100, food: 10, gold: 20 };
w.buildings.push({ id: 'building:2', type: 'lumber', level: 1, x: 5, y: 4 });
syncWorkers(w);
assert.equal(w.workers[0].phase, 'inside');
let inside = false,
  carrying = false;
for (let i = 0; i < 1000; i++) {
  updateWorkers(w, 0.1);
  carrying ||= w.workers[0].carried > 0;
  inside ||= carrying && w.workers[0].phase === 'inside';
}
assert.ok(carrying && inside);
const broken = structuredClone(s);
broken.adventure.seed = -4;
assert.throws(() => validateCampaign(broken));
console.log(
  'PASS: beach start, actual bridge gate/repair, retained old city and reversible island archive, pre-migration backup, persistent branching events, screen-relative joystick and collision, bounded rapid gathering, resumable job, worker indoor cycle, invalid campaign rejection.',
);
const fullSupply = prepareCampaign(fresh());
fullSupply.buildings.push({ id: 'building:2', type: 'lumber', level: 1, x: 5, y: 4 });
fullSupply.resources.food = 100;
const noSupply = structuredClone(fullSupply);
noSupply.resources.food = 0;
const beforeWood = fullSupply.resources.wood;
for (let i = 0; i < 3000; i++) {
  updateWorkers(fullSupply, 0.1);
  updateWorkers(noSupply, 0.1);
}
assert.ok(fullSupply.resources.wood > noSupply.resources.wood);
assert.ok(noSupply.resources.wood > beforeWood);
assert.equal(noSupply.resources.food, 0);
assert.equal(noSupply.workers.length, 1);
console.log(
  'PASS: no-food workers remain alive and productive at reduced efficiency; food never goes negative.',
);

const merchant = structuredClone(s);
merchant.adventure.trader = {
  x: 6,
  y: 11,
  active: true,
  stock: 2,
  offers: ['repair-kit', 'wood-food'],
  used: [],
};
merchant.hero.x = 6;
merchant.hero.y = 10;
const offerGold = merchant.resources.gold;
assert.equal(traderOffers(merchant).length, 2);
assert.ok(trade(merchant, 'repair-kit'));
assert.equal(merchant.resources.gold, offerGold - 4);
assert.equal(trade(merchant, 'repair-kit'), false);
const farm = merchant.adventure.sites.find((p) => p.id === 'farm');
assert.ok(siteCost(merchant, farm).wood < farm.cost.wood);
merchant.hero.x = farm.x - 1;
merchant.hero.y = farm.y;
merchant.revealed.push(`${farm.x},${farm.y}`);
farm.inspected = true;
assert.ok(restoreSite(merchant, farm.id));
assert.equal(merchant.adventure.items['repair-kit'], 0);
assert.ok(validateCampaign(merchant));
console.log(
  'PASS: persistent limited trader offers, no repeated purchase, usable repair item and matching restoration price.',
);
