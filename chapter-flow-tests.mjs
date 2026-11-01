import assert from 'node:assert/strict';
import {
  freshAdventure,
  inspectSite,
  restoreSite,
  acknowledgeBaseWelcome,
  validateCampaign,
} from './adventure.js';
import { tick, afford } from './engine.js';
import { findPath, smoothPath, advanceHero, revealAround } from './navigation.js';
import { updateWorkers } from './workers.js';
import { queueCraft } from './production.js';
import { activeOrder, deliverOrder, buyEquipment, introduceCarpenter } from './chapter.js';
const s = freshAdventure(Date.now() - 7200000, 987654);
s.adventure.introSeen = true;
s.adventure.tutorialSeen = true;
let time = 0;
const log = [];
function advance(seconds, path = []) {
  for (let a = 0; a < seconds - 0.000001; a += 0.1) {
    updateWorkers(s, 0.1);
    advanceHero(s, path, 0.1, 1.7);
    revealAround(s, s.hero, 2.5);
    tick(s, s.last + 100, false);
    s.adventure.playTime += 0.1;
    time += 0.1;
  }
}
async function checkpoint(label) {
  validateCampaign(structuredClone(s));
  log.push({
    label,
    seconds: Math.round(time),
    resources: Object.fromEntries(
      Object.entries(s.resources).map(([k, v]) => [k, Math.round(v * 10) / 10]),
    ),
  });
}
function go(id) {
  const p = s.adventure.sites.find((p) => p.id === id);
  const path = smoothPath(s, s.hero, findPath(s, s.hero, p));
  assert.ok(path, 'Reachable ' + id);
  for (let a = 0; path.length && a < 10000; a++) advance(0.1, path);
  assert.equal(path.length, 0);
  assert.ok(inspectSite(s, id).ok, 'inspect ' + id);
  return p;
}
function waitCost(cost) {
  let wait = 0;
  while (!afford(s, cost) && wait < 500) {
    advance(1);
    wait++;
  }
  assert.ok(
    afford(s, cost),
    'Materials after 500s ' + JSON.stringify({ cost, resources: s.resources, workers: s.workers }),
  );
  return wait;
}
async function restore(id) {
  const p = go(id);
  const wait = waitCost(p.cost || {});
  assert.ok(restoreSite(s, id), 'restore ' + id);
  if (id === 'camp') acknowledgeBaseWelcome(s, id);
  await checkpoint(id + ' (wait ' + wait + 's)');
}
async function craft(id, n) {
  const p = go(id),
    b = s.buildings.find((b) => b.id === p.buildingId);
  const recipe = (await import('./content.js')).RECIPES[
    b.type === 'sawmill'
      ? 'planks'
      : b.type === 'mason'
        ? 'cutStone'
        : b.type === 'kiln'
          ? 'charcoal'
          : 'iron'
  ];
  waitCost(Object.fromEntries(Object.entries(recipe.input).map(([k, v]) => [k, v * n])));
  assert.ok(queueCraft(s, b.id, n));
  let wait = 0;
  while (s.production.jobs.some((j) => j.buildingId === b.id) && wait++ < 500) advance(1);
  assert.ok(wait < 500);
  await checkpoint('craft ' + id + ' ' + n);
}
await restore('camp');
await restore('lumber');
await restore('garden');
await restore('quarry');
await restore('bridge');
await restore('farm');
await craft('farm', 6);
go('house');
go('camp');
assert.ok(introduceCarpenter(s));
go('house');
waitCost(activeOrder(s, 'house').needs);
assert.ok(deliverOrder(s, 'house', 'house-repair'));
await checkpoint('first order');
await restore('mason');
await restore('tradepost');
await craft('farm', 9);
await craft('mason', 6);
go('tradepost');
assert.ok(deliverOrder(s, 'tradepost', 'mason-sample'));
await checkpoint('second order');
assert.ok(
  log.find((p) => p.label === 'first order').seconds < 480,
  'First material order within eight simulated minutes',
);
assert.ok(
  log.find((p) => p.label === 'second order').seconds < 900,
  'Second meaningful order in first fifteen simulated minutes',
);
assert.ok(time < 1200, 'Opening chapter remains reachable without grinding');
console.log(
  'PASS: complete compact-chapter route, finite revealed supply, bridge and specialist gates, processing chains, carpenter exchange and merchant order within fifteen simulated minutes; no injected material income.',
);

export const completedChapter = s;
