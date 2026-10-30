import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  freshAdventure,
  validateCampaign,
  inspectSite,
  restoreSite,
  acknowledgeBaseWelcome,
} from './adventure.js';
import { updateWorkers } from './workers.js';
import { EXTRA_STONES, resourcesAt, liveResources, terrainAt } from './world.js';
import { revealAround, findPath } from './navigation.js';
import { queueCraft, craftEstimate, durationText } from './production.js';
import { currentTask, introduceCarpenter } from './chapter.js';
import { buildingLabel } from './world-ui.js';
const s = freshAdventure();
Object.assign(s.resources, { wood: 900, stone: 900, food: 100 });
function visit(id) {
  let p = s.adventure.sites.find((p) => p.id === id),
    path = findPath(s, s.hero, p);
  assert.ok(path, id);
  Object.assign(s.hero, path.at(-1) || s.hero);
  revealAround(s, s.hero, 2.5);
  inspectSite(s, id);
  return p;
}
visit('camp');
acknowledgeBaseWelcome(s, 'camp');
restoreSite(s, 'camp');
for (let id of ['garden', 'lumber', 'quarry', 'bridge', 'farm']) {
  visit(id);
  assert.ok(restoreSite(s, id));
}
assert.equal(currentTask(s).target, 'house');
visit('house');
assert.equal(currentTask(s).target, 'camp');
visit('camp');
introduceCarpenter(s);
assert.equal(currentTask(s).target, 'house');
assert.deepEqual(currentTask(s).needs, { planks: 3, stone: 8 });
let b = s.buildings.find((b) => b.type === 'sawmill'),
  before = JSON.stringify(s.resources);
const short = craftEstimate(s, b, 10),
  long = craftEstimate(s, b, 59);
assert.ok(short > 0 && long > short);
assert.equal(JSON.stringify(s.resources), before);
assert.ok(queueCraft(s, b.id, 5));
assert.ok(craftEstimate(s, b, 10) > short);
const slow = craftEstimate(s, b, 10);
assert.ok(craftEstimate(s, { ...b, level: 3 }, 10) < slow);
assert.equal(durationText(120), '2 p');
for (const [x, y] of EXTRA_STONES) {
  const rock = resourcesAt(x, y, 4).find((n) => n.kind === 'stone');
  assert.ok(rock);
  assert.equal(terrainAt(s, x, y), 'mountain');
  assert.ok(liveResources(s, x, y).includes(rock));
}
assert.equal(liveResources(s, 3, 9).length, 0);
assert.ok(validateCampaign(structuredClone(s)));
for (let x = 1; x < 14; x++) for (let y = 3; y < 17; y++) s.revealed.push(x + ',' + y);
s.revealed = [...new Set(s.revealed)];
s.buildings.forEach((b) => {
  if (['lumber', 'quarry'].includes(b.type)) b.level = 3;
});
let samples = 0;
for (let i = 0; i < 10000; i++) {
  let previous = new Map(s.workers.map((w) => [w.id, { x: w.x, y: w.y }]));
  updateWorkers(s, 0.03);
  for (const w of s.workers) {
    const p = previous.get(w.id);
    if (!p) continue;
    const dx = w.x - p.x,
      dy = w.y - p.y,
      d = Math.hypot(dx, dy);
    if (d > 0.00001 && w.action === 'walk') {
      const dot = (Math.sin(-w.angle) * dx + Math.cos(w.angle) * dy) / d;
      assert.ok(dot > 0.5, 'Moving workers face travel instead of backpedalling');
      samples++;
    }
  }
}
assert.ok(samples > 1000);
const label = buildingLabel({ x: 100, y: 200 }, 80, 0.9, true),
  shifted = buildingLabel({ x: -200, y: 120 }, 80, 0.9, true);
assert.equal(shifted.left - label.left, -300);
assert.equal(shifted.top - label.top, -80);
assert.equal(label.width, shifted.width);
assert.equal(buildingLabel({ x: 100, y: 200 }, 80, 0.9, false).height, 22);
const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8'),
  render = await fs.readFile(new URL('./renderer.js', import.meta.url), 'utf8');
assert.ok(app.includes('setTimeout(nextToast, 5000)'));
assert.ok(app.includes("patchMarkup($('detail'), detailHTML)"));
assert.ok(!app.includes('Egy darab alapideje:'));
assert.ok(render.includes('if (!item.frame'));
assert.ok(!render.includes('Math.min(width - w - 4'));
console.log(
  'PASS: worker travel direction across 1000+ real movement frames, supplemental finite stones, clear arrival shore, one current task, live total-work ETA, world-attached unclamped labels and stable-panel update wiring.',
);
