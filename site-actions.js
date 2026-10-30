import { afford, upgradeCost } from './engine.js';
import { siteRequirement, activeOrder } from './chapter.js';
import { key } from './world.js';
export function siteReadiness(s, p) {
  if (!p.inspected || !s.revealed.includes(key(p.x, p.y)) || !siteRequirement(s, p)) return null;
  const order = activeOrder(s, p.id);
  if (order && afford(s, order.needs)) return 'Átadható';
  if (p.restored) {
    const b = s.buildings.find((b) => b.id === p.buildingId),
      cost = upgradeCost(b);
    return cost && afford(s, cost) ? 'Fejleszthető' : null;
  }
  const repairCost = Object.fromEntries(
    Object.entries(p.cost || {}).map(([k, n]) => [
      k,
      Math.ceil(n * ((s.adventure.items['repair-kit'] || 0) > 0 ? 0.8 : 1)),
    ]),
  );
  return p.cost && !p.order && afford(s, repairCost) ? 'Helyreállítható' : null;
}
export function readySites(s) {
  return s.adventure.sites.filter((p) => siteReadiness(s, p));
}
