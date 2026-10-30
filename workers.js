import { TYPES, baseRate, resourceTarget, harvestHit, workerCount } from './engine.js';
import { liveResources, key } from './world.js';
import {
  ensureSupply,
  beginMeal,
  recoverWorker,
  useEnergy,
  workerEfficiency,
  supplyFactor,
  MEAL_FOOD,
  WORK_SECONDS,
} from './supply.js';
export { supplyFactor } from './supply.js';
import {
  canStand,
  walkable,
  findPath,
  smoothPath,
  advanceHero,
  resourcePath,
} from './navigation.js';

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
  ensureSupply(s);
  for (const b of s.buildings.filter((b) => ['lumber', 'quarry'].includes(b.type))) {
    for (let i = 0; i < workerCount(b); i++) {
      const id = `worker:${b.id}:${i}`;
      if (s.workers.some((w) => w.id === id)) continue;
      const p = home(s, b);
      if (p)
        s.workers.push({
          id,
          buildingId: b.id,
          x: b.x,
          y: b.y,
          phase: 'inside',
          energy: 100,
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
      return liveResources(s, x, y).filter(
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
    const start = ['inside', 'emerging'].includes(w.phase) ? home(s, owner) : w;
    const path = start && resourcePath(stateFor(s), start, node);
    if (path) return { node, path };
  }
  return null;
}
function returnHome(s, w) {
  const currentOwner = ownerOf(s, w);
  if (
    currentOwner &&
    Math.abs(w.x - currentOwner.x) < 0.49 &&
    Math.abs(w.y - currentOwner.y) < 0.49
  ) {
    beginDoor(s, w, true);
    return true;
  }
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
function beginDoor(s, w, entering) {
  const b = ownerOf(s, w),
    p = home(s, b, w);
  if (!p) return false;
  w.phase = entering ? 'entering' : 'emerging';
  w.doorMotion = {
    fromX: w.x,
    fromY: w.y,
    toX: entering ? b.x : p.x,
    toY: entering ? b.y : p.y,
    t: 0,
  };
  return true;
}
export function updateWorkers(s, dt) {
  dt = Math.max(0, Math.min(dt, 0.15));
  for (const w of syncWorkers(s)) {
    const b = ownerOf(s, w);
    if (!b) continue;
    w.action = 'idle';
    if (
      s.adventure &&
      (['outbound', 'working', 'returning'].includes(w.phase) ||
        (w.phase === 'inside' && !w.recovery && w.rest > 0 && !w.status?.startsWith('Nincs')))
    )
      useEnergy(w, dt);
    if (w.phase === 'resting') {
      w.phase = 'returning';
      paths.delete(w);
    }
    if (w.phase === 'entering' || w.phase === 'emerging') {
      if (!w.doorMotion && !beginDoor(s, w, w.phase === 'entering')) continue;
      const m = w.doorMotion;
      m.t = Math.min(1, m.t + dt / 0.65);
      w.x = m.fromX + (m.toX - m.fromX) * m.t;
      w.y = m.fromY + (m.toY - m.fromY) * m.t;
      w.action = 'walk';
      w.targetAngle = Math.atan2(-(m.toX - m.fromX), m.toY - m.fromY);
      w.angle = w.targetAngle;
      w.walkPhase = (w.walkPhase || 0) + dt * 0.4;
      if (m.t < 1) continue;
      delete w.doorMotion;
      if (w.phase === 'entering') {
        s.resources[b.type === 'lumber' ? 'wood' : 'stone'] += w.carried;
        w.carried = 0;
        w.phase = 'inside';
        w.rest = Math.max(
          1,
          3 / (baseRate(s, b) * 1.3 ** ((b.level || 1) - 1)) -
            (2 * (w.tripDistance || 0)) / 0.62 -
            2.2,
        );
        w.action = 'idle';
        w.status = 'Rakomány leadása';
        if (s.adventure && w.energy <= 15) beginMeal(s, w);
        continue;
      }
      w.phase = 'outbound';
      continue;
    }
    if (w.phase === 'inside') {
      w.x = b.x;
      w.y = b.y;
      if (s.adventure && !w.recovery && w.energy <= 15) beginMeal(s, w);
      if (recoverWorker(w, dt)) continue;
      w.rest = Math.max(0, (w.rest || 0) - dt);
      if (w.rest) continue;
      const work = findWork(s, w);
      if (!work) {
        w.status = 'Nincs elérhető nyersanyag. Új területet kell felfedezni.';
        w.rest = 3;
        continue;
      }
      w.targetId = work.node.id;
      w.workTime = 0;
      w.workHits = 0;
      const p = home(s, b);
      w.tripDistance = work.path.reduce((v, q, i, a) => v + distance(q, i ? a[i - 1] : p), 0);
      paths.set(w, work.path);
      beginDoor(s, w, false);
      continue;
    }
    if (w.phase === 'idle') {
      const work = findWork(s, w);
      if (!work) {
        w.status = 'Nincs elérhető, felfedezett nyersanyag 8 mezőn belül.';
        returnHome(s, w);
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
      if (path?.length && !canStand(stateFor(s), path[0].x, path[0].y)) {
        paths.delete(w);
        continue;
      }
      if (!path) {
        w.status = 'Az út el van zárva';
        continue;
      }
      if (path.length) {
        const next = path[0],
          dx = next.x - w.x,
          dy = next.y - w.y;
        if (Math.hypot(dx, dy) > 0.001) {
          w.targetAngle = Math.atan2(-dx, dy);
          const delta = Math.atan2(
            Math.sin(w.targetAngle - (w.angle ?? w.targetAngle)),
            Math.cos(w.targetAngle - (w.angle ?? w.targetAngle)),
          );
          if (Math.abs(delta) > 0.45) {
            w.angle = (w.angle ?? w.targetAngle) + delta * (1 - Math.exp(-dt * 15));
            w.action = 'idle';
            continue;
          }
        }
        w.action = 'walk';
        advanceHero({ ...s, hero: w }, path, dt, 0.62 * workerEfficiency(s, w), true);
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
          beginDoor(s, w, true);
          w.status = 'Belép az épületbe';
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
      w.workTime += dt * workerEfficiency(s, w);
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
    let budget = baseRate(s, b) * 1.3 ** ((b.level || 1) - 1) * seconds + (w.offlineRemainder || 0);
    w.offlineRemainder = budget % 1;
    if (s.adventure) {
      const foodPerUnit = MEAL_FOOD / (WORK_SECONDS * baseRate(s, b) * 1.3 ** ((b.level || 1) - 1));
      const full = Math.min(budget, s.resources.food / foodPerUnit);
      budget = full + (budget - full) * 0.55;
    }
    budget = Math.floor(budget * (s.chapter?.perks?.tools ? 2 : 1));
    while (budget > 0) {
      const work = findWork({ ...s, workers: [] }, w);
      if (!work) break;
      const n = work.node,
        remaining = s.resourceState[n.id]?.hitsLeft ?? n.hits;
      const amount = Math.min(budget, remaining);
      let extracted = 0;
      while (extracted < amount) {
        const hit = harvestHit(s, { x: n.tileX, y: n.tileY, resourceId: n.id }, Date.now(), false);
        if (!hit.ok) break;
        extracted += hit.amount;
      }
      if (!extracted) break;
      s.resources[n.kind] += extracted;
      if (s.adventure) {
        const foodPerUnit =
          MEAL_FOOD / (WORK_SECONDS * baseRate(s, b) * 1.3 ** ((b.level || 1) - 1));
        s.resources.food = Math.max(0, s.resources.food - extracted * foodPerUnit);
      }
      budget -= extracted;
    }
  }
}
