import { RECIPES } from './content.js';
import { beginMeal, recoverWorker, useEnergy, workerEfficiency } from './supply.js';
export const canPay = (s, cost) =>
  Object.entries(cost).every(([k, n]) => (s.resources[k] || 0) >= n);
export function payMaterials(s, cost) {
  for (const [k, n] of Object.entries(cost)) s.resources[k] -= n;
}
export function ensureProduction(s) {
  return (s.production ||= { serial: 1, jobs: [], crews: {} });
}
export function crewFor(s, b) {
  const p = ensureProduction(s);
  return (p.crews[b.id] ||= {
    id: 'artisan:' + b.id,
    buildingId: b.id,
    energy: 100,
    phase: 'inside',
    status: 'Munkára vár',
    x: b.x + 0.7,
    y: b.y + 0.45,
  });
}
export function queueCraft(s, buildingId, count = 1) {
  const b = s.buildings.find((b) => b.id === buildingId),
    recipe = b && Object.entries(RECIPES).find(([, r]) => r.building === b.type);
  if (!recipe || !Number.isInteger(count) || count < 1 || count > 12) return false;
  const p = ensureProduction(s),
    [recipeId, r] = recipe;
  if (p.jobs.filter((j) => j.buildingId === b.id).length + count > 12) return false;
  const cost = Object.fromEntries(Object.entries(r.input).map(([k, n]) => [k, n * count]));
  if (!canPay(s, cost)) return false;
  payMaterials(s, cost);
  crewFor(s, b);
  for (let i = 0; i < count; i++)
    p.jobs.push({ id: p.serial++, buildingId, recipeId, remaining: r.seconds });
  return true;
}
export function craftSpeed(s, b) {
  return (1 + 0.3 * ((b.level || 1) - 1)) * (s.chapter?.perks?.fastCraft ? 1.25 : 1);
}
export function advanceCrafting(s, seconds) {
  if (!s.production || seconds <= 0) return;
  for (const b of s.buildings) {
    let jobs = s.production.jobs.filter((j) => j.buildingId === b.id);
    if (!jobs.length) continue;
    const crew = crewFor(s, b),
      offline = seconds > 3;
    let budget = seconds * craftSpeed(s, b);
    if (!offline) {
      if (crew.recovery) {
        crew.phase = 'inside';
        recoverWorker(crew, seconds);
        continue;
      }
      if (crew.energy <= 15) {
        crew.phase = 'inside';
        beginMeal(s, crew);
        continue;
      }
      crew.phase = 'working';
      crew.status = 'Feldolgozás';
      useEnergy(crew, seconds);
      budget *= workerEfficiency(s, crew);
    } else {
      // A closed-game estimate consumes food only for actual queued processing time.
      const queued = jobs.reduce((sum, j) => sum + j.remaining, 0) / craftSpeed(s, b),
        work = Math.min(seconds, queued);
      const food = Math.min(s.resources.food, work / 60);
      s.resources.food -= food;
      budget *= food >= work / 60 ? 1 : 0.6;
    }
    while (budget > 0 && (jobs = s.production.jobs.filter((j) => j.buildingId === b.id)).length) {
      const job = jobs[0],
        used = Math.min(job.remaining, budget);
      job.remaining -= used;
      budget -= used;
      if (job.remaining <= 0.000001) {
        for (const [k, n] of Object.entries(RECIPES[job.recipeId].output))
          s.resources[k] = (s.resources[k] || 0) + n;
        s.production.jobs.splice(s.production.jobs.indexOf(job), 1);
      }
    }
    if (!s.production.jobs.some((j) => j.buildingId === b.id)) {
      crew.phase = 'inside';
      crew.status = 'Az adag elkészült';
    }
  }
}
export function validateProduction(s) {
  if (!s.production) return;
  const p = s.production;
  if (
    !Number.isSafeInteger(p.serial) ||
    p.serial < 1 ||
    !Array.isArray(p.jobs) ||
    p.jobs.length > s.buildings.length * 12 ||
    !p.crews ||
    typeof p.crews !== 'object' ||
    Array.isArray(p.crews)
  )
    throw Error('Hibás műhelymentés.');
  const ids = new Set(),
    perBuilding = new Map();
  for (const j of p.jobs) {
    const r = RECIPES[j.recipeId],
      b = s.buildings.find((b) => b.id === j.buildingId);
    if (
      !r ||
      !b ||
      b.type !== r.building ||
      !Number.isSafeInteger(j.id) ||
      j.id < 1 ||
      j.id >= p.serial ||
      ids.has(j.id) ||
      !Number.isFinite(j.remaining) ||
      j.remaining <= 0 ||
      j.remaining > r.seconds
    )
      throw Error('Hibás feldolgozási sor.');
    ids.add(j.id);
    perBuilding.set(j.buildingId, (perBuilding.get(j.buildingId) || 0) + 1);
    if (perBuilding.get(j.buildingId) > 12) throw Error('Túl hosszú feldolgozási sor.');
  }
  for (const [id, c] of Object.entries(p.crews))
    if (
      !s.buildings.some(
        (b) => b.id === id && Object.values(RECIPES).some((r) => r.building === b.type),
      ) ||
      c.id !== 'artisan:' + id ||
      !Number.isFinite(c.energy) ||
      c.energy < 0 ||
      c.energy > 100 ||
      !['inside', 'working'].includes(c.phase) ||
      typeof c.status !== 'string' ||
      c.status.length > 120 ||
      c.buildingId !== id ||
      !Number.isFinite(c.x) ||
      !Number.isFinite(c.y) ||
      c.x < 0 ||
      c.y < 0 ||
      c.x >= 41 ||
      c.y >= 41 ||
      (c.recovery &&
        (!Number.isFinite(c.recovery.remaining) ||
          c.recovery.remaining < 0 ||
          c.recovery.remaining > c.recovery.total ||
          !Number.isFinite(c.recovery.total) ||
          c.recovery.total < 20 ||
          c.recovery.total > 40 ||
          !Number.isFinite(c.recovery.targetEnergy) ||
          c.recovery.targetEnergy < 0 ||
          c.recovery.targetEnergy > 100 ||
          !Number.isFinite(c.recovery.startEnergy) ||
          c.recovery.startEnergy < 0 ||
          c.recovery.startEnergy > 100 ||
          !Number.isFinite(c.recovery.foodPaid) ||
          c.recovery.foodPaid < 0 ||
          c.recovery.foodPaid > 2))
    )
      throw Error('Hibás műhelydolgozó.');
}
