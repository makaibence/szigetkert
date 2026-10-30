import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  freshAdventure,
  validateCampaign,
  inspectSite,
  restoreSite,
  acknowledgeBaseWelcome,
  knownSite,
} from './adventure.js';
import { queueCraft, advanceCrafting, productionProgress, craftLimit } from './production.js';
import { carpenterWaiting, introduceCarpenter, activeOrder, deliverOrder } from './chapter.js';
import { upgrade, canUpgradeBuilding } from './engine.js';
import { revealAround, findPath } from './navigation.js';
import { STORE, loadGame } from './save.js';
const s = freshAdventure();
s.adventure.introSeen = true;
s.adventure.tutorialSeen = true;
function visit(id) {
  const p = s.adventure.sites.find((p) => p.id === id),
    path = findPath(s, s.hero, p);
  assert.ok(path, id + ' reachable');
  Object.assign(s.hero, path.at(-1) || s.hero);
  revealAround(s, s.hero, 2.5);
  assert.ok(inspectSite(s, id).ok);
  return p;
}
visit('camp');
acknowledgeBaseWelcome(s, 'camp');
assert.ok(restoreSite(s, 'camp'));
Object.assign(s.resources, { wood: 900, stone: 900, food: 100 });
for (const id of ['lumber', 'quarry', 'bridge', 'farm']) {
  visit(id);
  assert.ok(restoreSite(s, id));
}
const b = s.buildings.find((b) => b.type === 'sawmill');
assert.equal(canUpgradeBuilding(s, b), false);
assert.equal(upgrade(s, b.id), false);
const stock = s.resources.wood;
assert.ok(queueCraft(s, b.id, 100));
assert.equal(s.resources.wood, stock - 300);
assert.equal(s.production.jobs.length, 1);
assert.equal(productionProgress(s, b).total, 100);
advanceCrafting(s, 30);
assert.equal(s.resources.planks, 2);
assert.equal(productionProgress(s, b).left, 98);
assert.equal(productionProgress(s, b).inputLeft.wood, 294);
assert.ok(queueCraft(s, b.id, 20));
assert.equal(s.production.jobs.length, 1);
assert.equal(productionProgress(s, b).total, 120);
assert.equal(productionProgress(s, b).completed, 2);
const restored = validateCampaign(structuredClone(s));
assert.deepEqual(restored.production, s.production);
advanceCrafting(restored, 10000);
assert.equal(restored.resources.planks, 120);
advanceCrafting(restored, 10000);
assert.equal(restored.resources.planks, 120);
assert.equal(queueCraft(s, b.id, 100000), false);
assert.equal(
  craftLimit({ ...s, resources: { ...s.resources, wood: 2 } }, { input: { wood: 3 } }),
  0,
);
// A partially processed old twelve-item queue keeps all prepaid work and yields exactly once.
const legacy = structuredClone(s);
legacy.version = 6;
legacy.production.jobs = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  buildingId: b.id,
  recipeId: 'planks',
  remaining: i ? 20 : 7,
}));
legacy.production.serial = 13;
const raw = JSON.stringify(legacy);
const storage = {
  v: new Map([[STORE, raw]]),
  getItem(k) {
    return this.v.get(k) || null;
  },
  setItem(k, v) {
    this.v.set(k, v);
  },
};
const loaded = loadGame(storage);
assert.ok(loaded.writable);
assert.equal(storage.getItem('szigetkert.backup.pre-simplification-v7'), raw);
assert.equal(storage.getItem(STORE), raw);
assert.equal(loaded.state.production.jobs.length, 1);
assert.equal(loaded.state.production.jobs[0].count, 12);
assert.equal(loaded.state.production.jobs[0].remaining, 7);
const planks = loaded.state.resources.planks,
  wood = loaded.state.resources.wood;
advanceCrafting(loaded.state, 10000);
assert.equal(loaded.state.resources.planks, planks + 12);
assert.equal(loaded.state.resources.wood, wood);
s.resources.planks = 10;
visit('house');
assert.ok(carpenterWaiting(s));
assert.equal(activeOrder(s, 'house'), null);
assert.equal(introduceCarpenter(s), false);
visit('camp');
assert.ok(introduceCarpenter(s));
assert.equal(introduceCarpenter(s), false);
visit('house');
const order = activeOrder(s, 'house');
assert.deepEqual(order.reward, {});
const silver = s.resources.silver;
assert.ok(deliverOrder(s, 'house', order.id));
assert.equal(s.resources.silver, silver);
assert.equal(b.level, 2);
assert.ok(canUpgradeBuilding(s, b));
assert.equal(deliverOrder(s, 'house', order.id), false);
for (const id of ['ore', 'kiln', 'forge']) {
  const p = s.adventure.sites.find((p) => p.id === id);
  s.revealed.push(p.x + ',' + p.y);
  assert.equal(knownSite(s, p), false);
}
const oldAdvanced = structuredClone(s);
delete oldAdvanced.chapter.storyRevision;
oldAdvanced.resources.iron = 2;
const migrated = validateCampaign(oldAdvanced);
assert.ok(migrated.chapter.advancedUnlocked);
assert.equal(migrated.resources.iron, 2);
const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8'),
  html = await fs.readFile(new URL('./index.html', import.meta.url), 'utf8'),
  renderer = await fs.readFile(new URL('./renderer.js', import.meta.url), 'utf8');
assert.ok(!html.includes('data-tab="sites"') && !html.includes('data-tab="quests"'));
assert.ok(html.includes('id="nextgoal"'));
assert.ok(!app.includes('data-craft=') && !app.includes('data-equipment='));
const help = app.slice(app.indexOf('function showHelp()'), app.indexOf('function openIntro()'));
assert.ok(!help.includes('egyszeri készlet'));
assert.ok(!renderer.includes('drawBuildingMotion') && !renderer.includes("action: 'craft'"));
assert.ok(renderer.includes('productionProgress(s, b)'));
console.log(
  'PASS: 100+ unit resource-funded batch, explicit input/output and ongoing progress, bounded-time offline arithmetic, resumable v6 prepaid queue, no duplicate debit/credit, carpenter encounter and concrete mill repair, preserved old advanced materials, non-spoiling help and removed duplicate/primitive work UI.',
);
