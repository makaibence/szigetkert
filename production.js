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
export function craftLimit(s, recipe) {
  return Math.max(
    0,
    Math.min(
      ...Object.entries(recipe.input).map(([k, n]) => Math.floor((s.resources[k] || 0) / n)),
    ),
  );
}
export function queueCraft(s, buildingId, count = 1) {
  const b = s.buildings.find((b) => b.id === buildingId),
    entry = b && Object.entries(RECIPES).find(([, r]) => r.building === b.type);
  if (!entry || !Number.isSafeInteger(count) || count < 1) return false;
  const [recipeId, r] = entry;
  if (count > craftLimit(s, r)) return false;
  const p = ensureProduction(s),
    existing = p.jobs.find((j) => j.buildingId === buildingId && j.recipeId === recipeId);
  if (
    existing &&
    (!Number.isSafeInteger(existing.count + count) || !Number.isSafeInteger(existing.total + count))
  )
    return false;
  const cost = Object.fromEntries(Object.entries(r.input).map(([k, n]) => [k, n * count]));
  if (!existing && !Number.isSafeInteger(p.serial + 1)) return false;
  payMaterials(s, cost);
  crewFor(s, b);
  if (existing) {
    existing.count += count;
    existing.total += count;
  } else
    p.jobs.push({
      id: p.serial++,
      buildingId,
      recipeId,
      remaining: r.seconds,
      count,
      total: count,
      completed: 0,
    });
  return true;
}
export function productionProgress(s, b) {
  const jobs = (s.production?.jobs || []).filter((j) => j.buildingId === b.id);
  if (!jobs.length) return null;
  const r = RECIPES[jobs[0].recipeId],
    left = jobs.reduce((v, j) => v + (j.count ?? 1), 0),
    total = jobs.reduce((v, j) => v + (j.total ?? 1), 0),
    completed = jobs.reduce((v, j) => v + (j.completed || 0), 0);
  return {
    recipe: r,
    left,
    total,
    completed,
    fraction: Math.max(0, Math.min(1, (completed + 1 - jobs[0].remaining / r.seconds) / total)),
    inputLeft: Object.fromEntries(Object.entries(r.input).map(([k, n]) => [k, n * left])),
    outputLeft: Object.fromEntries(Object.entries(r.output).map(([k, n]) => [k, n * left])),
    outputKind: Object.keys(r.output)[0],
  };
}
export function craftSpeed(s, b) {
  const pace = ['sawmill', 'mason'].includes(b.type) ? 1.5 : 1;
  return pace * (1 + 0.3 * ((b.level || 1) - 1)) * (s.chapter?.perks?.fastCraft ? 1.25 : 1);
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
      const queued =
          jobs.reduce(
            (sum, j) => sum + j.remaining + ((j.count ?? 1) - 1) * RECIPES[j.recipeId].seconds,
            0,
          ) / craftSpeed(s, b),
        work = Math.min(seconds, queued);
      const food = Math.min(s.resources.food, work / 60);
      s.resources.food -= food;
      budget *= food >= work / 60 ? 1 : 0.6;
    }
    while (budget > 0 && (jobs = s.production.jobs.filter((j) => j.buildingId === b.id)).length) {
      const j = jobs[0],
        r = RECIPES[j.recipeId];
      if (budget + 1e-9 < j.remaining) {
        j.remaining -= budget;
        budget = 0;
        break;
      }
      budget = Math.max(0, budget - j.remaining);
      const finished = 1 + Math.min((j.count ?? 1) - 1, Math.floor((budget + 1e-9) / r.seconds));
      budget = Math.max(0, budget - (finished - 1) * r.seconds);
      j.count = (j.count ?? 1) - finished;
      j.completed = (j.completed || 0) + finished;
      j.remaining = r.seconds;
      for (const [k, n] of Object.entries(r.output))
        s.resources[k] = (s.resources[k] || 0) + n * finished;
      if (!j.count) s.production.jobs.splice(s.production.jobs.indexOf(j), 1);
    }
    if (!s.production.jobs.some((j) => j.buildingId === b.id)) {
      crew.phase = 'inside';
      crew.status = 'A vállalt munka elkészült';
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
    p.jobs.length > 10000 ||
    !p.crews ||
    typeof p.crews !== 'object' ||
    Array.isArray(p.crews)
  )
    throw Error('Hibás műhelymentés.');
  const ids = new Set(),
    perBuilding = new Map();
  for (const j of p.jobs) {
    if (s.version <= 6) {
      j.count ??= 1;
      j.total ??= j.count;
      j.completed ??= 0;
    }
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
      !Number.isSafeInteger(j.count) ||
      j.count < 1 ||
      !Number.isSafeInteger(j.total) ||
      j.total < j.count ||
      !Number.isSafeInteger(j.completed) ||
      j.completed < 0 ||
      j.completed + j.count !== j.total ||
      !Number.isFinite(j.remaining) ||
      j.remaining <= 0 ||
      j.remaining > r.seconds
    )
      throw Error('Hibás feldolgozási sor.');
    ids.add(j.id);
    perBuilding.set(j.buildingId, (perBuilding.get(j.buildingId) || 0) + 1);
  }
  if (s.version <= 6) {
    const groups = new Map();
    for (const j of p.jobs) {
      const list = groups.get(j.buildingId) || [];
      list.push(j);
      groups.set(j.buildingId, list);
    }
    for (const list of groups.values())
      if (
        list.length > 1 &&
        list
          .slice(1)
          .every(
            (j) => j.recipeId === list[0].recipeId && j.remaining === RECIPES[j.recipeId].seconds,
          )
      ) {
        list[0].count = list.reduce((n, j) => n + j.count, 0);
        list[0].total = list.reduce((n, j) => n + j.total, 0);
        list[0].completed = list.reduce((n, j) => n + j.completed, 0);
        p.jobs = p.jobs.filter((j) => !list.slice(1).includes(j));
      }
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

/** Estimate includes the existing queue, energy and automatic meal breaks. It is not a deadline. */
export function craftEstimate(s, b, additional = 0) {
  const recipe = RECIPES[Object.keys(RECIPES).find((k) => RECIPES[k].building === b.type)];
  if (!recipe) return 0;
  const crew = s.production?.crews?.[b.id],
    work =
      (s.production?.jobs || [])
        .filter((j) => j.buildingId === b.id)
        .reduce((n, j) => n + j.remaining + (j.count - 1) * RECIPES[j.recipeId].seconds, 0) +
      Math.max(0, additional) * recipe.seconds;
  if (!work) return 0;
  const fed = s.resources.food >= 2,
    rest = fed ? 20 : 40,
    cycle = fed ? 102 : 48,
    meanEnergy = fed ? 57.5 : 35;
  const efficiency = workerEfficiency(s, { energy: meanEnergy }),
    active = work / (craftSpeed(s, b) * efficiency);
  const first = crew?.recovery ? cycle : Math.max(0, ((crew?.energy ?? 100) - 15) * 1.2);
  return Math.ceil(
    active + (Math.max(0, active - first) * rest) / cycle + (crew?.recovery?.remaining || 0),
  );
}
export function durationText(seconds) {
  const n = Math.max(0, Math.ceil(seconds / 5) * 5),
    h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60),
    sec = n % 60;
  return h ? `${h} ó ${m} p` : m ? `${m} p ${sec ? sec + ' mp' : ''}`.trim() : `${n} mp`;
}
