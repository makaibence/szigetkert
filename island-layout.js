// Stable authored locations. Player-facing lists reveal only places already discovered.
export const LOCATIONS = [
  { id: 'wreck', kind: 'wreck', x: 2, y: 11, name: 'Partra sodródott roncs', art: 0 },
  {
    id: 'camp',
    kind: 'building',
    type: 'hut',
    number: 101,
    x: 5,
    y: 10,
    name: 'Menedék',
    art: 6,
    cost: { wood: 6, stone: 2 },
  },
  {
    id: 'lumber',
    kind: 'building',
    type: 'lumber',
    number: 102,
    x: 8,
    y: 10,
    name: 'Elhagyott favágótelep',
    art: 1,
    cost: { wood: 12, stone: 4 },
  },
  {
    id: 'quarry',
    kind: 'building',
    type: 'quarry',
    number: 103,
    x: 11,
    y: 7,
    name: 'Régi kőbánya',
    art: 2,
    cost: { wood: 15, stone: 6 },
  },
  {
    id: 'bridge',
    kind: 'bridge',
    x: 14,
    y: 12,
    name: 'Leszakadt fahíd',
    art: 4,
    cost: { wood: 24, stone: 8 },
    requires: 'lumber',
  },
  {
    id: 'farm',
    kind: 'building',
    type: 'farm',
    number: 104,
    x: 19,
    y: 10,
    name: 'Benőtt gazdaság',
    art: 3,
    cost: { wood: 18, stone: 10 },
  },
  { id: 'marker', kind: 'marker', x: 20, y: 16, name: 'Régi útjelző', art: 8 },
];
export const TRAILS = [
  [
    [2, 10],
    [5, 10],
    [7, 10],
    [9, 11],
    [12, 12],
    [14, 12],
    [17, 12],
    [19, 10],
  ],
  [
    [8, 10],
    [10, 9],
    [11, 8],
    [11, 7],
  ],
  [
    [17, 12],
    [19, 15],
    [20, 16],
    [24, 20],
    [28, 25],
  ],
];
export function pathDistance(x, y) {
  let best = Infinity;
  for (const line of TRAILS)
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1],
        [bx, by] = line[i],
        dx = bx - ax,
        dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  return best;
}
export function authoredTerrain(x, y, noise) {
  const west = ((x - 8) / 7) ** 2 + ((y - 10) / 7) ** 2 < 1;
  const east = ((x - 24) / 15) ** 2 + ((y - 21) / 17) ** 2 < 1 + Math.sin(y * 0.65) * 0.04;
  const neck = x >= 9 && x <= 19 && y >= 9 && y <= 15;
  if (!(west || east || neck)) return 'water';
  if (Math.abs(x - (14 + 0.35 * Math.sin((y - 12) * 0.2))) < 0.72) return 'water';
  if (((x - 26) / 3) ** 2 + ((y - 19) / 2.1) ** 2 < 1) return 'water';
  if (LOCATIONS.some((p) => p.x === x && p.y === y) || pathDistance(x, y) < 0.85) return 'grass';
  if ((x === 3 && y === 8) || (x === 11 && y === 6) || (x === 12 && y === 7)) return 'mountain';
  if ((x === 4 && y === 11) || (x === 4 && y === 12)) return 'forest';
  if (LOCATIONS.some((p) => p.kind === 'building' && Math.hypot(x - p.x, y - p.y) < 1.65))
    return 'grass';
  const woodland =
    ((x - 8) / 4.3) ** 2 + ((y - 12.2) / 3.8) ** 2 < 1 ||
    ((x - 22) / 5) ** 2 + ((y - 9) / 4) ** 2 < 1;
  if (woodland && noise(x + 17, y + 31) > 0.17) return 'forest';
  const grove = Math.sin(x * 0.42) + Math.cos(y * 0.38) + Math.sin((x + y) * 0.2);
  if (grove > 0.1 && noise(x + 15, y + 2) < 0.67) return 'forest';
  if (x > 9 && y < 9 && noise(x, y) > 0.58) return 'mountain';
  return noise(x, y) > 0.95 ? 'mountain' : 'grass';
}
