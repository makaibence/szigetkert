import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  freshAdventure,
  inspectSite,
  validateCampaign,
  restoreSite,
  acknowledgeBaseWelcome,
} from './adventure.js';
import { nearbyNotices, needsNotice, acknowledgeSiteNotice, siteNotice } from './site-notices.js';
import { revealAround, findPath, resourcePath } from './navigation.js';
import { craftSpeed, queueCraft, advanceCrafting, craftEstimate } from './production.js';
import { queueGather, advanceGathering } from './gathering.js';
import { liveResources } from './world.js';
import { ensureMerchant, currentTask, firstChapterComplete } from './chapter.js';
import { loadGame, STORE } from './save.js';
const s = freshAdventure(),
  base = s.adventure.sites.find((p) => p.id === 'camp');
s.adventure.introSeen = s.adventure.tutorialSeen = true;
s.hero.x = 4;
s.hero.y = 10;
revealAround(s, s.hero, 2.5);
assert.equal(needsNotice(s, base), true);
assert.ok(nearbyNotices(s).some((p) => p.id === 'camp'));
assert.equal(base.inspected, false);
assert.equal(s.resources.wood, 0); // proximity does not grant or restore.
s.hero.x = 1;
assert.ok(!nearbyNotices(s).some((p) => p.id === 'camp'));
assert.equal(acknowledgeSiteNotice(s, base.id), false);
s.hero.x = 4;
assert.ok(nearbyNotices(s).some((p) => p.id === 'camp'));
assert.ok(acknowledgeSiteNotice(s, base.id));
assert.ok(inspectSite(s, base.id).ok);
const once = { ...s.resources };
acknowledgeBaseWelcome(s, base.id);
inspectSite(s, base.id);
assert.deepEqual(s.resources, once);
assert.equal(needsNotice(s, base), false);
assert.ok(!nearbyNotices(validateCampaign(structuredClone(s))).some((p) => p.id === 'camp'));
assert.ok(restoreSite(s, 'camp'));
Object.assign(s.resources, { wood: 600, stone: 600, food: 100 });
for (const id of ['garden', 'lumber', 'quarry', 'bridge', 'farm']) {
  const p = s.adventure.sites.find((p) => p.id === id),
    path = findPath(s, s.hero, p);
  assert.ok(path);
  Object.assign(s.hero, path.at(-1) || s.hero);
  revealAround(s, s.hero, 2.5);
  acknowledgeSiteNotice(s, id);
  inspectSite(s, id);
  assert.ok(restoreSite(s, id));
}
ensureMerchant(s);
const trader = s.adventure.trader,
  yard = s.adventure.sites.find((p) => p.id === 'tradepost'),
  home = s.adventure.sites.find((p) => p.id === 'house');
assert.ok(Math.hypot(trader.x - yard.x, trader.y - yard.y) < 1.8);
assert.ok(Math.hypot(trader.x - home.x, trader.y - home.y) > 3);
assert.ok(findPath(s, s.hero, trader));
const mill = s.buildings.find((b) => b.type === 'sawmill');
assert.equal(craftSpeed(s, mill), 1.5);
assert.ok(queueCraft(s, mill.id, 6));
const estimate = craftEstimate(s, mill);
assert.ok(estimate > 0);
const progress = structuredClone(s.production);
const loaded = validateCampaign(structuredClone(s));
assert.deepEqual(loaded.production, progress);
advanceCrafting(loaded, 40);
assert.equal(loaded.resources.planks, 3);
// Each displayed hit exactly matches the real credited amount, even with boosted repeated tapping.
let n;
for (let x = 3; x < 14 && !n; x++)
  for (let y = 4; y < 16 && !n; y++)
    for (const node of liveResources(s, x, y))
      if (node.kind === 'stone' && resourcePath(s, s.hero, node)) n = node;
assert.ok(n);
Object.assign(s.hero, resourcePath(s, s.hero, n).at(-1));
revealAround(s, s.hero, 2.5);
queueGather(s, n);
queueGather(s, n);
const stock = s.resources.stone;
let gains = 0,
  hits = 0;
for (let i = 0; i < 80; i++) {
  const r = advanceGathering(s, 0.1);
  gains += (r.rewards || []).reduce((a, b) => a + b.amount, 0);
  hits += r.impacts;
}
assert.ok(hits > 0);
assert.equal(s.resources.stone - stock, gains);
const bridge = s.adventure.sites.find((p) => p.id === 'bridge');
assert.ok(!siteNotice(bridge).text.includes('fa'));
assert.ok(!siteNotice(bridge).text.includes('Szükséges'));
const old = structuredClone(s);
old.adventure.sites.forEach((p) => delete p.noticeAccepted);
const raw = JSON.stringify(old),
  map = new Map([[STORE, raw]]);
assert.ok(
  loadGame({ getItem: (k) => map.get(k) || null, setItem: (k, v) => map.set(k, v) }).writable,
);
assert.equal(map.get('szigetkert.backup.pre-v13'), raw);
const max = structuredClone(s);
max.chapter.completedOrders.push('house-repair', 'mason-sample');
max.buildings.push(
  { id: 'test-mason', type: 'mason', level: 3, x: 21, y: 9 },
  { id: 'test-trade', type: 'tradepost', level: 1, x: 16, y: 15 },
);
max.buildings.forEach((b) => (b.level = 3));
assert.ok(firstChapterComplete(max));
assert.equal(currentTask(max).title, 'Az első fejezet teljes');
const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');
assert.ok(!app.includes('Az átjáró helyreállításához:'));
assert.ok(app.includes('s.resources[node.kind] - beforeGather'));
assert.ok(app.includes('renderer.showGain({'));
console.log(
  'PASS: proximity introduction requires acknowledgement, leave/return and reload preserve it, no duplicate starter grant; merchant access and separation; 50% faster prepaid crafting; displayed gathering rewards equal credited resources; honest chapter end and raw pre-update backup.',
);
