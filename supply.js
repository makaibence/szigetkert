import { TYPES, buildingRate } from './engine.js';
export const WORK_SECONDS = 120,
  MEAL_FOOD = 2,
  REST_SECONDS = 20,
  HUNGRY_REST_SECONDS = 40;
export function ensureSupply(s) {
  s.economy ||= { revision: 1, supply: 100 };
  for (const w of s.workers || []) w.energy ??= 100;
  return s.economy;
}
export function beginMeal(s, w) {
  if (w.recovery) return;
  const e = ensureSupply(s),
    paid = Math.min(MEAL_FOOD, s.resources.food),
    ratio = paid / MEAL_FOOD;
  s.resources.food -= paid;
  e.supply = Math.max(0, Math.min(100, e.supply + (ratio * 2 - 1) * 8));
  const total = REST_SECONDS + (HUNGRY_REST_SECONDS - REST_SECONDS) * (1 - ratio);
  w.recovery = {
    remaining: total,
    total,
    startEnergy: w.energy,
    targetEnergy: 55 + 45 * ratio,
    foodPaid: paid,
  };
  w.status =
    ratio === 1
      ? 'Étkezés és pihenés'
      : ratio > 0
        ? 'Kevés étel · hosszabb pihenés'
        : 'Nincs étel · hosszabb pihenés';
}
export function recoverWorker(w, dt) {
  const r = w.recovery;
  if (!r) return false;
  r.remaining = Math.max(0, r.remaining - dt);
  w.energy = r.startEnergy + (r.targetEnergy - r.startEnergy) * (1 - r.remaining / r.total);
  if (r.remaining === 0) {
    w.energy = r.targetEnergy;
    delete w.recovery;
    w.rest = 0;
  }
  return true;
}
export function useEnergy(w, dt) {
  w.energy = Math.max(0, (w.energy ?? 100) - (dt * 100) / WORK_SECONDS);
}
export function supplyFactor(s) {
  return s.adventure ? 0.7 + (0.3 * ensureSupply(s).supply) / 100 : 1;
}
export function workerEfficiency(s, w) {
  return supplyFactor(s) * (s.adventure ? 0.75 + (0.25 * (w.energy ?? 100)) / 100 : 1);
}
export function supplySummary(s) {
  const e = ensureSupply(s),
    workers = [...(s.workers || []), ...Object.values(s.production?.crews || {})].filter((w) =>
      s.buildings.some((b) => b.id === w.buildingId),
    );
  const working = workers.filter((w) =>
    ['outbound', 'working', 'returning', 'entering', 'emerging'].includes(w.phase),
  ).length;
  const resting = workers.filter((w) => !!w.recovery).length;
  const production = s.buildings.reduce(
    (sum, b) => sum + (TYPES[b.type].output === 'food' ? buildingRate(s, b) * 60 : 0),
    0,
  );
  // Planning estimate assumes full work cycles; walking and unloaded waiting can reduce consumption.
  const demand = (workers.length * MEAL_FOOD * 60) / WORK_SECONDS;
  const net = production - demand;
  return {
    level: Math.round(e.supply),
    label: e.supply >= 70 ? 'Jó' : e.supply >= 35 ? 'Akadozó' : 'Hiányos',
    working,
    resting,
    waiting: workers.length - working - resting,
    total: workers.length,
    production,
    demand,
    net,
    minutesLeft: net < -0.001 ? s.resources.food / -net : null,
  };
}
