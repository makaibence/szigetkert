import { SIZE, key, terrainAt, regionUnlocked } from './world.js';
export function walkable(s, x, y) {
  return (
    x >= 0 &&
    y >= 0 &&
    x < SIZE &&
    y < SIZE &&
    terrainAt(s, x, y) === 'grass' &&
    regionUnlocked(s, x, y) &&
    (!s.onlyRevealed || s.revealed.includes(key(x, y))) &&
    !s.buildings.some((b) => b.x === x && b.y === y)
  );
}
export function findPath(s, from, target) {
  const start = { x: Math.round(from.x), y: Math.round(from.y) },
    goals = [];
  if (walkable(s, target.x, target.y)) goals.push(target);
  else
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const p = { x: target.x + dx, y: target.y + dy };
      if (walkable(s, p.x, p.y)) goals.push(p);
    }
  if (!goals.length) return null;
  const goalKeys = new Set(goals.map((p) => key(p.x, p.y))),
    queue = [start],
    seen = new Map([[key(start.x, start.y), null]]);
  let end = null;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i],
      k = key(p.x, p.y);
    if (goalKeys.has(k)) {
      end = p;
      break;
    }
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }));
    neighbors.sort(
      (a, b) =>
        Math.abs(a.x - target.x) +
        Math.abs(a.y - target.y) -
        Math.abs(b.x - target.x) -
        Math.abs(b.y - target.y),
    );
    for (const n of neighbors) {
      const nk = key(n.x, n.y);
      if (!seen.has(nk) && walkable(s, n.x, n.y)) {
        seen.set(nk, p);
        queue.push(n);
      }
    }
  }
  if (!end) return null;
  const path = [];
  for (let p = end; p; p = seen.get(key(p.x, p.y))) path.push(p);
  return path.reverse().slice(1);
}
export function revealAround(s, hero, radius = 3) {
  const known = new Set(s.revealed);
  let count = 0;
  for (
    let x = Math.max(0, Math.floor(hero.x - radius));
    x <= Math.min(SIZE - 1, Math.ceil(hero.x + radius));
    x++
  )
    for (
      let y = Math.max(0, Math.floor(hero.y - radius));
      y <= Math.min(SIZE - 1, Math.ceil(hero.y + radius));
      y++
    ) {
      if ((x - hero.x) ** 2 + (y - hero.y) ** 2 > radius ** 2 || !regionUnlocked(s, x, y)) continue;
      const k = key(x, y);
      if (!known.has(k)) {
        known.add(k);
        count++;
      }
    }
  s.revealed = [...known];
  s.explored += count;
  return count;
}
export function advanceHero(s, path, dt) {
  let remaining = Math.min(Math.max(dt, 0), 0.15) * 0.62;
  while (path.length && remaining > 0) {
    const target = path[0],
      dx = target.x - s.hero.x,
      dy = target.y - s.hero.y,
      distance = Math.hypot(dx, dy);
    s.hero.targetAngle = Math.atan2(-dx, dy);
    s.hero.walkPhase = (s.hero.walkPhase || 0) + Math.min(distance, remaining);
    s.hero.direction = dx > 0 ? 'se' : dx < 0 ? 'nw' : dy > 0 ? 'sw' : 'ne';
    if (distance <= remaining) {
      s.hero.x = target.x;
      s.hero.y = target.y;
      remaining -= distance;
      path.shift();
    } else {
      s.hero.x += (dx / distance) * remaining;
      s.hero.y += (dy / distance) * remaining;
      remaining = 0;
    }
  }
  return path.length === 0;
}
export function lineClear(s, a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y),
    steps = Math.max(1, Math.ceil(distance / 0.08));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps,
      x = a.x + (b.x - a.x) * t,
      y = a.y + (b.y - a.y) * t;
    for (const [dx, dy] of [
      [0, 0],
      [0.12, 0],
      [-0.12, 0],
      [0, 0.12],
      [0, -0.12],
    ])
      if (!walkable(s, Math.round(x + dx), Math.round(y + dy))) return false;
  }
  return true;
}
export function smoothPath(s, from, path, precise) {
  if (!path) return null;
  const points = [...path];
  if (precise && walkable(s, Math.round(precise.x), Math.round(precise.y))) {
    const p = points.at(-1) || from;
    if (lineClear(s, p, precise)) points.push({ x: precise.x, y: precise.y });
  }
  const result = [];
  let anchor = from,
    index = 0;
  while (index < points.length) {
    let furthest = index;
    for (let j = index; j < points.length; j++) {
      if (lineClear(s, anchor, points[j])) furthest = j;
      else break;
    }
    result.push(points[furthest]);
    anchor = points[furthest];
    index = furthest + 1;
  }
  return result;
}
export function resourcePath(s, from, node) {
  const raw = findPath(s, from, { x: node.tileX, y: node.tileY });
  if (!raw) return null;
  const end = raw.at(-1) || from,
    dx = end.x - node.x,
    dy = end.y - node.y,
    d = Math.hypot(dx, dy) || 1;
  const precise = { x: node.x + (dx / d) * 0.68, y: node.y + (dy / d) * 0.68 };
  return smoothPath(s, from, raw, precise);
}
