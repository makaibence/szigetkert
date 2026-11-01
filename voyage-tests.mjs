import assert from 'node:assert/strict';
import { completedChapter } from './chapter-flow-tests.mjs';
import { validateCampaign } from './adventure.js';
import { findPath, smoothPath, advanceHero, revealAround, canStand } from './navigation.js';
import {
  startProject,
  advanceVoyage,
  readVoyageDiary,
  inspectVoyageSite,
  turnLever,
  testGate,
  puzzleHint,
  deliverRigging,
  projectDone,
} from './voyage.js';
import { beginSailing, advanceSailing, settleAway } from './island-travel.js';
import { PROJECTS } from './voyage-content.js';
import { tick, CAP } from './engine.js';
import { queueCraft } from './production.js';
import { loadGame, STORE } from './save.js';
const clone = structuredClone;
const old = structuredClone(completedChapter);
old.version = 8;
delete old.voyage;
const data = new Map([[STORE, JSON.stringify(old)]]);
const storage = { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, v) };
const migrated = loadGame(storage);
assert.equal(migrated.writable, true);
assert.equal(data.get('szigetkert.backup.pre-v14-v9'), JSON.stringify(old));
const s = validateCampaign(clone(old));
s.last = Date.now();
assert.equal(s.version, 9);
for (const k of ['resources', 'buildings', 'production', 'hero', 'resourceState'])
  assert.deepEqual(s[k], old[k], 'migration preserves ' + k);
s.chapter.completedOrders.push(
  ...['mason-sample'].filter((id) => !s.chapter.completedOrders.includes(id)),
);
Object.assign(s.resources, {
  wood: 1600,
  stone: 1200,
  planks: 240,
  cutStone: 120,
  silver: 80,
  iron: 12,
  food: 100,
});
let paths = 0;
function go(id) {
  const p = s.adventure.sites.find((p) => p.id === id);
  assert.ok(p, 'site ' + id);
  const route = findPath(s, s.hero, p);
  assert.ok(route, 'path ' + id + ' from ' + JSON.stringify(s.hero));
  const path = smoothPath(s, s.hero, route);
  for (let i = 0; path.length && i < 8000; i++) advanceHero(s, path, 0.1, 2.5);
  assert.equal(path.length, 0, 'reached ' + id);
  assert.ok(Math.hypot(s.hero.x - p.x, s.hero.y - p.y) <= 1.8);
  assert.ok(canStand(s, s.hero.x, s.hero.y), 'standing ' + id);
  revealAround(s, s.hero, 2.5);
  paths++;
  return p;
}
function check() {
  assert.doesNotThrow(() => validateCampaign(clone(s)));
}
async function fixture() {
  s.last = Date.now();
}
function job(id) {
  go(PROJECTS[id].site);
  const stock = clone(s.resources);
  assert.ok(startProject(s, id), 'start ' + id);
  assert.equal(startProject(s, id), false, 'no duplicate ' + id);
  assert.deepEqual(
    s.resources,
    Object.fromEntries(Object.entries(stock).map(([k, v]) => [k, v - (PROJECTS[id].cost[k] || 0)])),
  );
  check();
  advanceVoyage(s, PROJECTS[id].seconds / 2);
  check();
  const restored = validateCampaign(clone(s));
  assert.equal(restored.voyage.job.remaining, s.voyage.job.remaining);
  advanceVoyage(s, 999);
  const after = clone(s.resources);
  advanceVoyage(s, 999);
  assert.deepEqual(s.resources, after, 'no repeated completion');
  assert.ok(projectDone(s, id));
  check();
}
go('camp');
await fixture('home');
job('home-roof');
job('home-floor');
assert.ok(readVoyageDiary(s));
assert.equal(s.voyage.homeLevel, 3);
check();
for (const id of ['harbour', 'pier-note', 'drydock']) {
  go(id);
  assert.ok(inspectVoyageSite(s, id));
  check();
}
job('pier');
job('winch');
go('harbour');
await fixture('gate');
const noCost = clone(s.resources);
assert.equal(testGate(s), false);
assert.ok(puzzleHint(s));
assert.deepEqual(s.resources, noCost);
const v = s.voyage;
for (const i of [0, 1]) while (v.levers[i] !== v.variant) assert.ok(turnLever(s, i));
if (!v.levers[2]) turnLever(s, 2);
check();
assert.ok(testGate(s));
job('boat-hull');
job('boat-mast');
job('boat-rudder');
go('tradepost');
assert.ok(deliverRigging(s));
assert.equal(deliverRigging(s), false);
job('boat-rigging');
go('farm');
const workshop = s.buildings.find((b) => b.type === 'sawmill');
assert.ok(queueCraft(s, workshop.id, 3));
go('harbour');
await fixture('ready');
const homeBuildings = clone(s.buildings),
  homeRevealed = clone(s.revealed),
  homeResourceState = clone(s.resourceState);
assert.ok(beginSailing(s, 'echo'));
for (let i = 0; i < 9; i++) advanceSailing(s, 0.12, s.last);
check();
await fixture('sailing');
for (let i = 0; i < 20; i++) advanceSailing(s, 0.12, s.last);
assert.equal(s.worldVersion, 5);
assert.equal(s.voyage.currentIsland, 'echo');
assert.deepEqual(s.voyage.worlds.home.buildings, homeBuildings);
check();
await fixture('echo');
// Shared home production while away is accounted once, with finite deposits.
const before = clone(s.resources);
settleAway(s, s.last + 10000);
const after = clone(s.resources);
settleAway(s, s.last + 10000);
assert.deepEqual(s.resources, after);
settleAway(s, s.last - 5000);
settleAway(s, s.last + 10000);
assert.deepEqual(s.resources, after, 'backward clock cannot duplicate production');
const fullWork = s.voyage.worlds.home.production.jobs.reduce((n, j) => n + j.remaining, 0);
settleAway(s, s.last + 40000);
assert.ok(s.resources.planks > before.planks, 'prepaid workshop completes while away');
assert.equal(s.voyage.worlds.home.production.jobs.length, 0);
assert.ok(s.resources.food >= before.food, 'home garden produces');
check();
go('echo-home');
assert.ok(inspectVoyageSite(s, 'echo-home'));
// A reserved repair can finish while its island is not currently displayed.
const awayRepair = clone(s);
assert.ok(startProject(awayRepair, 'echo-repair'));
awayRepair.hero = { x: 3, y: 11 };
revealAround(awayRepair, awayRepair.hero, 2.5);
assert.ok(beginSailing(awayRepair, 'home'));
for (let i = 0; i < 27; i++) advanceSailing(awayRepair, 0.12, awayRepair.last);
advanceVoyage(awayRepair, 20);
assert.ok(awayRepair.voyage.worlds.echo.adventure.sites.find((p) => p.id === 'echo-home').restored);
assert.doesNotThrow(() => validateCampaign(awayRepair));
job('echo-repair');
go('echo-beacon');
assert.ok(inspectVoyageSite(s, 'echo-beacon'));
job('echo-beacon');
assert.ok(s.voyage.beaconLit);
check();
await fixture('beacon');
go('echo-landing');
assert.ok(beginSailing(s, 'home'));
for (let i = 0; i < 27; i++) advanceSailing(s, 0.12, s.last);
assert.equal(s.worldVersion, 4);
assert.deepEqual(s.buildings, homeBuildings);
assert.deepEqual(s.revealed, homeRevealed);
assert.ok(s.voyage.worlds.echo);
check();
job('home-living');
job('home-courtyard');
assert.equal(s.voyage.homeLevel, 5);
await fixture('complete');
// Repeat voyage preserves explored island and restored sites.
go('harbour');
assert.ok(beginSailing(s, 'echo'));
for (let i = 0; i < 27; i++) advanceSailing(s, 0.12, s.last);
assert.ok(s.adventure.sites.find((p) => p.id === 'echo-home').restored);
assert.ok(s.adventure.sites.find((p) => p.id === 'echo-beacon').restored);
check();
const archived = clone(completedChapter);
delete archived.archive;
delete archived.otherIslands;
s.archive = archived;
assert.deepEqual(validateCampaign(clone(s)).archive, validateCampaign(clone(archived)));
for (const variant of [0, 1, 2]) {
  const p = clone(s);
  p.voyage.currentIsland = 'home';
  p.worldVersion = 4;
  p.adventure = clone(p.voyage.worlds.home.adventure);
  p.revealed = clone(p.voyage.worlds.home.revealed);
  p.hero = { x: 8, y: 14 };
  p.voyage.variant = variant;
  p.voyage.gateOpen = false;
  p.voyage.levers = [variant, variant, 1];
  assert.ok(testGate(p), 'valid puzzle variant ' + variant);
}
for (const mutate of [
  (x) => (x.voyage.job = { id: 'wat', remaining: 1, total: 1 }),
  (x) => (x.voyage.travel = { from: 'echo', to: 'home', elapsed: -1, total: 3 }),
  (x) => (x.voyage.worlds.home.accountedAt = -1),
  (x) => (x.voyage.worlds.home.buildings[0].type = 'bogus'),
]) {
  const bad = clone(s);
  mutate(bad);
  assert.throws(() => validateCampaign(bad));
}
console.log(
  'PASS: v8 migration unchanged; reserved repairs and resume; ' +
    paths +
    ' physical routes; local multi-step puzzle and hints; one-time rigging; resumable sailing; shared inventory; home economy once; distinct worlds/fog/buildings retained after return; new-island chapter and home level 5; malformed saves rejected.',
);
