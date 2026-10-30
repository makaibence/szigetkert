import { authoredTerrain } from './island-layout.js';
/** Stable world coordinates and resource identities. Artwork never owns save data. */
export const SIZE = 41;
export const key = (x, y) => `${x},${y}`;
export const noise = (x, y) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
export function terrain(x, y, version = 1) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return 'water';
  if (version >= 2) return authoredTerrain(x, y, noise, version);
  // Preserve the original starting island, including existing building sites.
  if (x <= 10 && y <= 10) {
    if ((x - 5) ** 2 + (y - 5) ** 2 > 29) return 'water';
    if ((x === 5 && y === 5) || (x === 4 && y === 5) || (x === 4 && y === 4)) return 'grass';
    const n = (x * 31 + y * 17 + x * y * 7) % 13;
    return n < 3 ? 'forest' : n === 4 || n === 5 ? 'mountain' : 'grass';
  }
  const dx = x - 20,
    dy = y - 20,
    angle = Math.atan2(dy, dx);
  const radius = 17.4 + 1.9 * Math.sin(angle * 3) + 0.9 * Math.cos(angle * 7);
  if (dx * dx + dy * dy > radius * radius) return 'water';
  if (
    Math.abs(y - (0.7 * x + 3)) < 1.5 ||
    Math.abs(x - (20 + Math.sin(y * 0.24) * 5)) < 1.5 ||
    y % 9 === 0 ||
    x % 10 === 0
  )
    return 'grass';
  const hash = noise(x, y);
  return hash < 0.25 ? 'forest' : hash < 0.31 ? 'mountain' : 'grass';
}
const definitions = new Map();
export function resourcesAt(x, y, version = 1) {
  const k = version + ':' + key(x, y);
  if (definitions.has(k)) return definitions.get(k);
  const t = terrain(x, y, version),
    result = [];
  const count = t === 'forest' ? 3 : t === 'mountain' ? 1 : 0;
  for (let i = 0; i < count; i++)
    result.push(
      Object.freeze({
        id: `${t === 'forest' ? 'tree' : 'rock'}:${x}:${y}:${i}`,
        tileX: x,
        tileY: y,
        x: x + (count === 1 ? 0 : (noise(x + i, y) - 0.5) * 0.56),
        y: y + (count === 1 ? 0 : (noise(x, y + i + 2) - 0.5) * 0.48),
        kind: t === 'forest' ? 'wood' : 'stone',
        hits: t === 'forest' ? 72 : 120,
        yield: 1,
        variant:
          t === 'forest'
            ? Math.floor(noise(x + i * 13, y + 41) * 8)
            : 8 + Math.floor(noise(x, y) * 3),
        scale: 0.86 + noise(x, y + i * 7) * 0.31,
      }),
    );
  definitions.set(k, result);
  return result;
}
export function liveResources(s, x, y) {
  return resourcesAt(x, y, s.worldVersion).filter(
    (r) =>
      !s.resourceState?.[r.id]?.cleared &&
      !(
        s.chapter &&
        (s.adventure?.sites.some(
          (p) =>
            p.kind === 'building' &&
            Math.hypot(p.x - r.x, p.y - r.y) < (r.kind === 'wood' ? 1.6 : 1.25),
        ) ||
          (s.adventure?.trader?.active &&
            Math.hypot(s.adventure.trader.x - r.x, s.adventure.trader.y - r.y) < 1.5))
      ),
  );
}
export function terrainAt(s, x, y) {
  const bridge = s.adventure?.sites?.find((p) => p.kind === 'bridge' && p.x === x && p.y === y);
  if (bridge?.restored) return 'grass';
  if (
    s.adventure?.sites?.some(
      (p) =>
        ((p.kind === 'building' && !p.restored) ||
          p.kind === 'wreck' ||
          p.kind === 'marker' ||
          (p.kind === 'ore' && p.oreLeft !== 0)) &&
        p.x === x &&
        p.y === y,
    )
  )
    return 'rubble';
  const base = terrain(x, y, s.worldVersion);
  return (base === 'forest' || base === 'mountain') && liveResources(s, x, y).length === 0
    ? 'grass'
    : base;
}
export function regionUnlocked(s, x, y) {
  if (
    s.worldVersion === 4 &&
    (x >= 22 || y >= 16) &&
    !s.chapter?.completedOrders?.includes('house-repair')
  )
    return false;
  if (s.worldVersion >= 2)
    return x < 15 || !!s.adventure?.sites?.find((p) => p.id === 'bridge' && p.restored);
  return (
    (x <= 11 && y <= 11) ||
    s.unlocked?.includes('main') ||
    (s.buildings.some((b) => b.type === 'lumber') && s.buildings.some((b) => b.type === 'quarry'))
  );
}
