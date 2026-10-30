import assert from 'node:assert/strict';
import {
  freshAdventure,
  inspectSite,
  restoreSite,
  validateCampaign,
  startFreshAdventure,
  switchCampaign,
  acknowledgeBaseWelcome,
} from './adventure.js';
import { fresh, afford, upgradeCost, tick, CAP } from './engine.js';
import {
  activeOrder,
  deliverOrder,
  buyEquipment,
  ensureChapter,
  introduceCarpenter,
} from './chapter.js';
import { queueCraft, advanceCrafting, craftSpeed } from './production.js';
import { siteReadiness } from './site-actions.js';
import { findPath, revealAround } from './navigation.js';
import { materialAmounts, iconSource } from './ui-icons.js';
import { loadGame, STORE } from './save.js';
// Tests below construct their own valid chapter; no external fixture is required.
const s = freshAdventure();
s.adventure.introSeen = true;
for (let x = 0; x < 30; x++) for (let y = 0; y < 24; y++) revealAround(s, { x, y }, 0.1);
const visit = (id) => {
  const p = s.adventure.sites.find((p) => p.id === id);
  const path = findPath(s, s.hero, p);
  assert.ok(path, 'reachable ' + id);
  Object.assign(s.hero, path.at(-1) || s.hero);
  revealAround(s, s.hero, 2.5);
  assert.ok(inspectSite(s, id).ok);
  return p;
};
visit('camp');
acknowledgeBaseWelcome(s, 'camp');
assert.ok(restoreSite(s, 'camp'));
Object.assign(s.resources, { wood: 2000, stone: 2000, food: 100 });
for (const id of ['garden', 'lumber', 'quarry', 'bridge', 'farm']) {
  visit(id);
  assert.ok(restoreSite(s, id));
}
const mill = s.buildings.find((b) => b.type === 'sawmill');
assert.deepEqual(upgradeCost({ type: 'quarry', level: 1 }), { wood: 18, stone: 10 });
assert.deepEqual(upgradeCost({ type: 'quarry', level: 2 }), { wood: 36, stone: 20 });
assert.equal(upgradeCost({ type: 'hut', level: 1 }), null);
const wood = s.resources.wood;
assert.ok(queueCraft(s, mill.id, 3));
assert.equal(s.resources.wood, wood - 9);
assert.equal(queueCraft(s, mill.id, 0), false);
assert.equal(queueCraft(s, mill.id, Infinity), false);
assert.equal(queueCraft(s, mill.id, 1000), false);
assert.equal(queueCraft(s, s.buildings.find((b) => b.type === 'hut').id, 1), false);
advanceCrafting(s, 10);
assert.ok(s.production.jobs[0].remaining > 0);
assert.equal(s.resources.planks, 0);
const reloaded = validateCampaign(JSON.parse(JSON.stringify(s)));
assert.deepEqual(reloaded.production, s.production);
advanceCrafting(reloaded, 180);
assert.equal(reloaded.resources.planks, 3);
assert.equal(reloaded.production.jobs.length, 0);
const unchanged = reloaded.resources.planks;
advanceCrafting(reloaded, CAP);
assert.equal(reloaded.resources.planks, unchanged);
const bankrupt = structuredClone(s);
bankrupt.resources.wood = 0;
const frozen = JSON.stringify(bankrupt.production);
assert.equal(queueCraft(bankrupt, mill.id, 1), false);
assert.equal(JSON.stringify(bankrupt.production), frozen);
s.production = reloaded.production;
s.resources = reloaded.resources;
const house = visit('house');
visit('camp');
assert.ok(introduceCarpenter(s));
visit('house');
const order = activeOrder(s, 'house');
assert.equal(order.id, 'house-repair');
assert.equal(siteReadiness(s, house), 'Átadható');
const oldHero = { ...s.hero };
s.hero.x = 2;
s.hero.y = 10;
assert.equal(deliverOrder(s, 'house', order.id), false);
Object.assign(s.hero, oldHero);
assert.ok(deliverOrder(s, 'house', order.id));
assert.equal(s.resources.silver, 0);
assert.equal(mill.level, 2);
assert.ok(house.restored);
assert.equal(deliverOrder(s, 'house', order.id), false);
assert.ok(queueCraft(s, mill.id, 3));
advanceCrafting(s, 100);
visit('mason');
assert.ok(restoreSite(s, 'mason'));
visit('tradepost');
assert.ok(restoreSite(s, 'tradepost'));
assert.equal(buyEquipment(s, 'workbench'), false);
assert.equal(s.resources.silver, 0);
assert.equal(buyEquipment(s, 'workbench'), false);
assert.ok(Math.abs(craftSpeed(s, mill) / craftSpeed(s, { ...mill, level: 1 }) - 1.3) < 1e-9);
const traderOrder = activeOrder(s, 'tradepost');
Object.assign(s.resources, { cutStone: 3, planks: 2 });
assert.ok(deliverOrder(s, 'tradepost', traderOrder.id));
assert.equal(s.resources.silver, 10);
assert.equal(deliverOrder(s, 'tradepost', traderOrder.id), false);
assert.ok(validateCampaign(structuredClone(s)));
for (const mutation of [
  (q) => q.production.jobs.push({ ...s.production.jobs[0], id: 999999 }),
  (q) => (q.production.serial = -1),
  (q) => (q.production.crews[mill.id].energy = 101),
  (q) => q.chapter.completedOrders.push('unknown'),
  (q) => (q.chapter.perks.money = true),
]) {
  const bad = structuredClone(s);
  mutation(bad);
  assert.throws(() => validateCampaign(bad));
}
// Multiple old islands stay reversible, including queued work and typed material balances.
const old = validateCampaign(fresh()),
  second = startFreshAdventure(old),
  third = startFreshAdventure(second);
third.resources.planks = 17;
const back = switchCampaign(third, 1);
assert.deepEqual(back.buildings, old.buildings);
assert.deepEqual(back.resources, old.resources);
const thirdAgain = switchCampaign(back);
assert.equal(thirdAgain.resources.planks, 17);
assert.ok(validateCampaign(structuredClone(thirdAgain)));
// Real pre-change story migration: stable IDs, levels, positions and resource balance stay intact.
const v = structuredClone(s);
v.version = 5;
delete v.chapter;
delete v.production;
const originalFarm = v.adventure.sites.find((p) => p.id === 'farm');
originalFarm.type = 'farm';
v.buildings.find((b) => b.id === originalFarm.buildingId).type = 'farm';
for (const k of ['planks', 'cutStone', 'silver', 'charcoal', 'ironOre', 'iron'])
  delete v.resources[k];
const keptBuilding = { ...v.buildings.find((b) => b.id === originalFarm.buildingId) };
const raw = JSON.stringify(v);
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
assert.equal(loaded.state.resources.wood, v.resources.wood);
assert.equal(storage.getItem('szigetkert.backup.pre-chapter-v6'), raw);
assert.equal(storage.getItem(STORE), raw);
const converted = loaded.state.buildings.find((b) => b.id === keptBuilding.id);
assert.deepEqual(converted, { ...keptBuilding, type: 'sawmill' });
assert.equal(loaded.state.worldVersion, v.worldVersion);
const mock = { thumbnail: (atlas, i) => atlas + ':' + i };
assert.equal(iconSource('wood', mock), 'props:0');
assert.equal(iconSource('gold', mock), 'props:3');
assert.equal(iconSource('silver', mock), 'items:2');
const icons = materialAmounts({ wood: 18, stone: 10 }, mock, { available: s.resources });
assert.ok(icons.includes('src="props:0"') && icons.includes('src="props:1"'));
assert.ok(!/🪵|🪨|🪙/.test(icons));
console.log(
  'PASS: resource-bounded reserved crafting, resumable jobs, offline outputs once, insufficient-input rejection, local one-time orders, carpenter repair instead of silver reward, basic wood/stone upgrades, multi-island retention, pre-v6 raw backup, identical inventory/cost artwork.',
);
