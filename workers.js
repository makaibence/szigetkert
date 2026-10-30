import { TYPES, resourceTarget, harvestHit, workerCount } from './engine.js';
import { resourcesAt, key } from './world.js';
import { walkable, findPath, smoothPath, advanceHero, resourcePath } from './navigation.js';

const paths = new WeakMap();
const stateFor = (s) => ({ ...s, onlyRevealed: true });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ownerOf = (s, w) => s.buildings.find((b) => b.id === w.buildingId);
function home(s, b, from = b) {
  return [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]
    .map(([x, y]) => ({ x: b.x + x, y: b.y + y }))
    .filter((p) => walkable(stateFor(s), p.x, p.y))
    .sort((a, c) => distance(a, from) - distance(c, from))[0];
}
function route(s, w, target) {
  const view = stateFor(s),
    raw = findPath(view, w, target);
  return smoothPath(view, w, raw);
}
export function syncWorkers(s) {
  s.workers ||= [];
  for (const b of s.buildings.filter((b) => ['lumber', 'quarry'].includes(b.type))) {
    for (let i = 0; i < workerCount(b); i++) {
      const id = `worker:${b.id}:${i}`;
      if (s.workers.some((w) => w.id === id)) continue;
      const p = home(s, b);
      if (p)
        s.workers.push({
          id,
          buildingId: b.id,
          x: p.x,
          y: p.y,
          phase: i ? 'resting' : 'idle',
          carried: 0,
          workTime: 0,
          workHits: 0,
          rest: i * 3,
          walkPhase: 0,
          offlineRemainder: 0,
        });
    }
  }
  return s.workers;
}
function targetFromId(s, id) {
  if (!id) return null;
  const [, x, y] = id.split(':');
  return resourceTarget(s, Number(x), Number(y), id);
}
export function findWork(s, w) {
  const owner = ownerOf(s, w);
  if (!owner) return null;
  const kind = owner.type === 'lumber' ? 'wood' : 'stone';
  const candidates = s.revealed
    .flatMap((k) => {
      const [x, y] = k.split(',').map(Number);
      if (Math.hypot(x - owner.x, y - owner.y) > 8) return [];
      return resourcesAt(x, y).filter(
        (n) =>
          n.kind === kind &&
          !s.resourceState[n.id]?.cleared &&
          !s.workers.some(
            (other) =>
              other.id !== w.id &&
              other.targetId === n.id &&
              ['working', 'outbound'].includes(other.phase),
          ),
      );
    })
    .sort((a, b) => distance(a, owner) - distance(b, owner));
  for (const node of candidates) {
    const path = resourcePath(stateFor(s), w, node);
    if (path) return { node, path };
  }
  return null;
}
function returnHome(s, w) {
  const owner = ownerOf(s, w),
    dest = owner && home(s, owner, w);
  const path = dest && route(s, w, dest);
  w.phase = 'returning';
  w.action = 'idle';
  w.status = w.carried ? 'Hazaszállítás' : 'Visszatérés a telepre';
  if (path) paths.set(w, path);
  else paths.delete(w);
  return !!path;
}
export function updateWorkers(s, dt) {
  dt = Math.max(0, Math.min(dt, 0.15));
  for (const w of syncWorkers(s)) {
    const b = ownerOf(s, w);
    if (!b) continue;
    w.action = 'idle';
    if (w.phase === 'resting') {
      w.rest = Math.max(0, w.rest - dt);
      if (!w.rest) w.phase = 'idle';
      else continue;
    }
    if (w.phase === 'idle') {
      const work = findWork(s, w);
      if (!work) {
        w.status = 'Nincs elérhető, felfedezett nyersanyag 8 mezőn belül.';
        w.phase = 'resting';
        w.rest = 3;
        continue;
      }
      w.status = 'Munkába indul';
      w.targetId = work.node.id;
      w.phase = 'outbound';
      w.workTime = 0;
      w.workHits = 0;
      w.tripDistance = work.path.reduce((v, p, i, a) => v + distance(p, i ? a[i - 1] : w), 0);
      paths.set(w, work.path);
    }
    if (w.phase === 'outbound' || w.phase === 'returning') {
      let path = paths.get(w);
      if (!path) {
        const node = targetFromId(s, w.targetId);
        if (w.phase === 'outbound' && node) path = resourcePath(stateFor(s), w, node);
        else {
          returnHome(s, w);
          path = paths.get(w);
        }
        if (path) paths.set(w, path);
      }
      // A moved building can invalidate an old route. Replan instead of walking through it.
      if (path?.length && !walkable(stateFor(s), Math.round(path[0].x), Math.round(path[0].y))) {
        paths.delete(w);
        continue;
      }
      if (!path) {
        w.status = 'Az út el van zárva';
        continue;
      }
      if (path.length) {
        w.action = 'walk';
        advanceHero({ ...s, hero: w }, path, dt);
      }
      if (!path.length) {
        paths.delete(w);
        if (w.phase === 'outbound') {
          w.phase = 'working';
          w.workTime = 0;
          w.workHits = 0;
        } else {
          const dest = home(s, b, w);
          if (!dest || distance(w, dest) > 0.2) {
            returnHome(s, w);
            continue;
          }
          s.resources[b.type === 'lumber' ? 'wood' : 'stone'] += w.carried;
          w.carried = 0;
          w.phase = 'resting';
          w.rest = Math.max(
            1,
            3 / (TYPES[b.type].rate * 1.3 ** ((b.level || 1) - 1)) -
              (2 * (w.tripDistance || 0)) / 0.62 -
              2.2,
          );
          w.status = 'Lerakodás és pihenő';
        }
      }
    }
    if (w.phase === 'working') {
      const node = targetFromId(s, w.targetId);
      if (!node) {
        returnHome(s, w);
        continue;
      }
      w.action = node.kind === 'wood' ? 'chop' : 'mine';
      w.status = node.kind === 'wood' ? 'Fát vág' : 'Követ fejt';
      w.targetAngle = Math.atan2(-(node.x - w.x), node.y - w.y);
      w.workTime += dt;
      while (w.workHits < 3 && w.workTime >= 0.17 + w.workHits * 0.966667) {
        const result = harvestHit(
          s,
          { x: node.tileX, y: node.tileY, resourceId: node.id },
          Date.now(),
          false,
        );
        if (!result.ok) {
          returnHome(s, w);
          break;
        }
        w.carried += result.amount;
        w.workHits++;
        if (result.finished || w.workHits === 3) {
          returnHome(s, w);
          break;
        }
      }
    }
    const desired = Number.isFinite(w.targetAngle) ? w.targetAngle : 0,
      current = Number.isFinite(w.angle) ? w.angle : desired;
    w.angle =
      current +
      Math.atan2(Math.sin(desired - current), Math.cos(desired - current)) *
        (1 - Math.exp(-dt * 12));
  }
}
/** Closed-game estimate: finite discovered resources, no animated background process. */
export function produceOfflineWorkers(s, seconds) {
  if (seconds <= 0) return;
  for (const w of syncWorkers(s)) {
    const b = ownerOf(s, w);
    let budget =
      TYPES[b.type].rate * 1.3 ** ((b.level || 1) - 1) * seconds + (w.offlineRemainder || 0);
    w.offlineRemainder = budget % 1;
    budget = Math.floor(budget);
    while (budget > 0) {
      const work = findWork({ ...s, workers: [] }, w);
      if (!work) break;
      const n = work.node,
        remaining = s.resourceState[n.id]?.hitsLeft ?? n.hits;
      const amount = Math.min(budget, remaining);
      for (let i = 0; i < amount; i++)
        harvestHit(s, { x: n.tileX, y: n.tileY, resourceId: n.id }, Date.now(), false);
      s.resources[n.kind] += amount * n.yield;
      budget -= amount;
    }
  }
}
