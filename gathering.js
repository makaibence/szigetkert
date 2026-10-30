import { resourceTarget, harvestHit } from './engine.js';
export function queueGather(s, node) {
  const existing = s.hero.job;
  if (existing?.targetId === node.id) {
    existing.left = Math.min(6, existing.left + 1);
    existing.boost = Math.min(2.4, existing.boost + 0.3);
    return existing;
  }
  return (s.hero.job = { targetId: node.id, left: 3, clock: 0, nextImpact: 0.17, boost: 1 });
}
export function advanceGathering(s, dt) {
  const j = s.hero.job;
  if (!j) return { impacts: 0 };
  const [, x, y] = j.targetId.split(':');
  const node = resourceTarget(s, Number(x), Number(y), j.targetId);
  if (!node) {
    delete s.hero.job;
    return { impacts: 0, finished: true };
  }
  if (Math.hypot(s.hero.x - node.x, s.hero.y - node.y) > 1.3) return { impacts: 0, distant: true };
  j.clock += Math.max(0, Math.min(0.12, dt)) * j.boost;
  j.boost = Math.max(1, j.boost - Math.max(0, Math.min(0.12, dt)) * 0.2);
  let impacts = 0;
  const rewards = [];
  while (j.left > 0 && j.clock >= j.nextImpact) {
    const r = harvestHit(s, { x: node.tileX, y: node.tileY, resourceId: node.id });
    j.nextImpact += 0.966667;
    j.left--;
    if (r.ok) {
      impacts++;
      rewards.push({ kind: r.kind, amount: r.amount, x: node.x, y: node.y });
    }
    if (!r.ok || r.finished) j.left = 0;
  }
  const done = j.left === 0 && j.clock >= j.nextImpact - 0.966667 + 0.3,
    clock = j.clock;
  if (done) delete s.hero.job;
  return { impacts, rewards, finished: done, clock, kind: node.kind, node };
}
