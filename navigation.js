import { SIZE, key, terrainAt, regionUnlocked, liveResources } from './world.js';
export function canStand(s, x, y) {
  const cx = Math.round(x),
    cy = Math.round(y),
    t = terrainAt(s, cx, cy);
  if (
    x < 0 ||
    y < 0 ||
    x >= SIZE - 1 ||
    y >= SIZE - 1 ||
    !regionUnlocked(s, cx, cy) ||
    t === 'water' ||
    t === 'rubble' ||
    (s.onlyRevealed && !s.revealed.includes(key(cx, cy)))
  )
    return false;
  if (s.buildings.some((b) => Math.abs(b.x - x) < 0.49 && Math.abs(b.y - y) < 0.49)) return false;
  if (
    s.adventure?.sites.some(
      (p) =>
        p.kind === 'landmark' &&
        !['note', 'landing'].includes(p.voyageRole) &&
        Math.abs(p.x - x) < 0.4 &&
        Math.abs(p.y - y) < 0.4,
    )
  )
    return false;
  for (let a = cx - 1; a <= cx + 1; a++)
    for (let b = cy - 1; b <= cy + 1; b++)
      for (const node of liveResources(s, a, b))
        if (Math.hypot(node.x - x, node.y - y) < (node.kind === 'wood' ? 0.19 : 0.34)) return false;
  return true;
}
export function walkable(s, x, y) {
  return (
    x >= 0 &&
    y >= 0 &&
    x < SIZE &&
    y < SIZE &&
    terrainAt(s, x, y) === 'grass' &&
    regionUnlocked(s, x, y) &&
    (!s.onlyRevealed || s.revealed.includes(key(x, y))) &&
    !s.buildings.some((b) => b.x === x && b.y === y) &&
    !s.adventure?.sites.some(
      (p) =>
        p.kind === 'landmark' &&
        !['note', 'landing'].includes(p.voyageRole) &&
        p.x === x &&
        p.y === y,
    ) &&
    !(s.adventure?.trader?.active && s.adventure.trader.x === x && s.adventure.trader.y === y)
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
      if (!seen.has(nk) && walkable(s, n.x, n.y) && (i !== 0 || lineClear(s, from, n))) {
        seen.set(nk, p);
        queue.push(n);
      }
    }
  }
  if (!end) return null;
  const path = [];
  for (let p = end; p; p = seen.get(key(p.x, p.y))) path.push(p);
  const result = path.reverse().slice(1);
  // A fractional position in the goal cell still has to reach the actual doorway.
  if (!result.length && Math.hypot(from.x - end.x, from.y - end.y) > 0.02) {
    if (!lineClear(s, from, end)) return null;
    result.push({ x: end.x, y: end.y });
  }
  return result;
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
export function advanceHero(s, path, dt, speed = 0.62, stopAtCorner = false) {
  let remaining = Math.min(Math.max(dt, 0), 0.15) * speed;
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
      if (stopAtCorner) remaining = 0;
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
      if (!canStand(s, x + dx, y + dy)) return false;
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
  const path = smoothPath(s, from, raw),
    end = path.at(-1) || from,
    base = Math.atan2(end.y - node.y, end.x - node.x),
    reach = node.kind === 'wood' ? 0.45 : 0.53;
  for (const offset of [0, 1, -1, 2, -2, 3, -3, 4]) {
    const angle = base + (offset * Math.PI) / 4,
      p = { x: node.x + Math.cos(angle) * reach, y: node.y + Math.sin(angle) * reach };
    if (lineClear(s, end, p)) {
      path.push(p);
      return path;
    }
  }
  return Math.hypot(end.x - node.x, end.y - node.y) <= 0.65 ? path : null;
}

// Direct control uses the inverse isometric projection, then collision-safe substeps.
export function driveHero(s, screen, dt, speed = 1.8) {
  const sx = screen.x || 0,
    sy = screen.y || 0,
    m = Math.min(1, Math.hypot(sx, sy));
  if (m < 0.04) return false;
  let dx = (sx / 0.72 + sy / 0.38) / 2,
    dy = (sy / 0.38 - sx / 0.72) / 2;
  const n = Math.hypot(dx, dy) || 1;
  dx = (dx / n) * speed * Math.min(0.12, Math.max(0, dt)) * m;
  dy = (dy / n) * speed * Math.min(0.12, Math.max(0, dt)) * m;
  const safe = (x, y) =>
    [
      [0, 0],
      [0.12, 0],
      [-0.12, 0],
      [0, 0.12],
      [0, -0.12],
    ].every(([a, b]) => canStand(s, x + a, y + b));
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.04));
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    const ox = s.hero.x,
      oy = s.hero.y,
      nx = ox + dx / steps,
      ny = oy + dy / steps;
    if (safe(nx, ny)) {
      s.hero.x = nx;
      s.hero.y = ny;
    } else if (safe(nx, oy)) s.hero.x = nx;
    else if (safe(ox, ny)) s.hero.y = ny;
    moved += Math.hypot(s.hero.x - ox, s.hero.y - oy);
  }
  if (moved) {
    s.hero.targetAngle = Math.atan2(-dx, dy);
    s.hero.walkPhase = (s.hero.walkPhase || 0) + moved;
  }
  return moved > 0;
}
