import { SIZE, key, terrain, terrainAt, resourcesAt, liveResources } from './world.js';
export { SIZE, key, terrain, terrainAt, resourcesAt, liveResources };
export const VERSION = 4,
  CAP = 8 * 3600;
export const TYPES = {
  hut: {
    name: 'Kunyhó',
    icon: '🏡',
    cost: { wood: 20, stone: 5 },
    output: 'food',
    rate: 0.08,
    desc: 'Élelem a szigetlakóknak',
  },
  lumber: {
    name: 'Favágótelep',
    icon: '🪵',
    cost: { wood: 15, stone: 10 },
    output: 'wood',
    rate: 0.12,
    desc: 'Automatikusan gyűjti a fát',
  },
  quarry: {
    name: 'Kőbánya',
    icon: '⛏️',
    cost: { wood: 25, food: 10 },
    output: 'stone',
    rate: 0.1,
    desc: 'Automatikusan gyűjti a követ',
  },
  farm: {
    name: 'Gazdaság',
    icon: '🌾',
    cost: { wood: 20, stone: 10 },
    output: 'food',
    rate: 0.15,
    desc: 'Élelem a településnek',
  },
  market: {
    name: 'Piac',
    icon: '🏪',
    cost: { wood: 45, stone: 30, food: 20 },
    output: 'gold',
    rate: 0.07,
    desc: 'Aranyat termel',
  },
};
export const RES = {
  wood: ['🪵', 'Fa'],
  stone: ['🪨', 'Kő'],
  food: ['🌾', 'Élelem'],
  gold: ['🪙', 'Arany'],
};
export function fresh(now = Date.now()) {
  const revealed = [];
  for (let x = 3; x <= 7; x++) for (let y = 3; y <= 7; y++) revealed.push(key(x, y));
  return {
    version: VERSION,
    worldVersion: 1,
    nextBuildingId: 2,
    hero: { x: 4, y: 5, direction: 'se' },
    resources: { wood: 65, stone: 40, food: 35, gold: 10 },
    buildings: [{ id: 'building:1', x: 5, y: 5, type: 'hut', level: 1 }],
    resourceState: {},
    workers: [],
    unlocked: ['starter'],
    revealed,
    claimed: [],
    gathered: 0,
    explored: 0,
    last: now,
    created: now,
  };
}
export function bonus() {
  return 1;
} // No adjacency rule in the current specification.
export const workerCount = (b) =>
  ['lumber', 'quarry'].includes(b.type) ? Math.min(3, b.level || 1) : 0;
export const productionMultiplier = (b) =>
  workerCount(b) ? workerCount(b) * 1.3 ** ((b.level || 1) - 1) : 1.6 ** ((b.level || 1) - 1);
export function upgradeCost(b) {
  if (!b || (b.level || 1) >= 3) return null;
  const level = b.level || 1;
  return { wood: 25 * level, stone: 20 * level, food: 10 * level, gold: 5 * level };
}
export function upgrade(s, id) {
  const b = s.buildings.find((b) => b.id === id),
    cost = upgradeCost(b);
  if (!cost || !afford(s, cost)) return false;
  pay(s, cost);
  b.level = (b.level || 1) + 1;
  return true;
}
export function buildingRate(s, b) {
  return (
    (s.worldVersion === 2 && b.type === 'hut' ? 0.02 : TYPES[b.type].rate) * productionMultiplier(b)
  );
}
export function rates(s) {
  const r = { wood: 0, stone: 0, food: 0, gold: 0 };
  for (const b of s.buildings) r[TYPES[b.type].output] += buildingRate(s, b);
  return r;
}
export function tick(s, now = Date.now(), includeWorkers = true) {
  const dt = Math.min(CAP, Math.max(0, (now - s.last) / 1000)),
    r = rates(s);
  for (const k in r)
    if (includeWorkers || (k !== 'wood' && k !== 'stone')) s.resources[k] += r[k] * dt;
  s.last = Math.max(s.last, now);
  return dt;
}
export const afford = (s, c) => Object.entries(c).every(([k, v]) => s.resources[k] >= v);
function pay(s, c) {
  for (const k in c) s.resources[k] -= c[k];
}
export function placement(s, x, y, ignoreId) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE)
    return { ok: false, reason: 'A szigeten belül válassz helyet.' };
  if (!s.revealed.includes(key(x, y)))
    return { ok: false, reason: 'Előbb fedezd fel ezt a területet.' };
  if (terrainAt(s, x, y) !== 'grass') return { ok: false, reason: 'Előbb tisztítsd meg a helyet.' };
  if (s.buildings.some((b) => b.id !== ignoreId && b.x === x && b.y === y))
    return { ok: false, reason: 'Itt már áll egy épület.' };
  if (s.hero && Math.hypot(s.hero.x - x, s.hero.y - y) < 0.55)
    return { ok: false, reason: 'A karaktered helyét hagyd szabadon.' };
  if (s.workers?.some((w) => Math.hypot(w.x - x, w.y - y) < 0.45))
    return { ok: false, reason: 'Várd meg, amíg a munkás elhalad erről a helyről.' };
  return { ok: true, reason: 'Építésre alkalmas hely' };
}
export function build(s, type, x, y) {
  if (!TYPES[type] || !placement(s, x, y).ok || !afford(s, TYPES[type].cost)) return false;
  pay(s, TYPES[type].cost);
  s.buildings.push({ id: `building:${s.nextBuildingId++}`, type, x, y, level: 1 });
  return true;
}
export function move(s, index, x, y) {
  const b = s.buildings[index];
  if (!b || !placement(s, x, y, b.id).ok) return false;
  Object.assign(b, { x, y });
  return true;
}
export function frontier(s, x, y) {
  return (
    x >= 0 &&
    y >= 0 &&
    x < SIZE &&
    y < SIZE &&
    !s.revealed.includes(key(x, y)) &&
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([a, b]) => s.revealed.includes(key(x + a, y + b)))
  );
}
export function explore(s, x, y) {
  if (!frontier(s, x, y) || !afford(s, { food: 5 })) return false;
  pay(s, { food: 5 });
  s.revealed.push(key(x, y));
  s.explored++;
  return true;
}
export function resourceTarget(s, x, y, id) {
  return liveResources(s, x, y).find((r) => !id || r.id === id);
}
export function harvestHit(s, target, now = Date.now(), credit = true) {
  const node = resourceTarget(s, target.x, target.y, target.resourceId);
  if (!node || !s.revealed.includes(key(target.x, target.y))) return { ok: false };
  const state =
    s.resourceState[node.id] ||
    (s.resourceState[node.id] = { hitsLeft: node.hits, cleared: false });
  state.hitsLeft = Math.max(0, state.hitsLeft - 1);
  state.lastHit = now;
  if (credit) {
    s.resources[node.kind] += node.yield;
    s.gathered += node.yield;
  }
  if (state.hitsLeft === 0 && !state.cleared) {
    state.cleared = true;
    state.clearedAt = now;
  }
  return { ok: true, finished: state.cleared, kind: node.kind, amount: node.yield, id: node.id };
}
export function gather(s, x, y) {
  const node = resourceTarget(s, x, y);
  if (!node) return false;
  let result;
  for (let i = 0; i < 3; i++) {
    result = harvestHit(s, { x, y, resourceId: node.id });
    if (!result.ok) return false;
    if (result.finished) return true;
  }
  return !!result?.ok;
}
export const QUESTS = [
  {
    id: 'first',
    kind: 'Fő küldetés',
    title: 'Egy falu első napja',
    text: 'Építs egy favágótelepet és egy kőbányát.',
    reward: { wood: 30, food: 20 },
    test: (s) =>
      s.buildings.some((b) => b.type === 'lumber') && s.buildings.some((b) => b.type === 'quarry'),
  },
  {
    id: 'village',
    kind: 'Mérföldkő',
    title: 'Élettel teli sziget',
    text: 'Legyen 6 épületed, köztük egy piac.',
    reward: { gold: 40, stone: 30 },
    test: (s) => s.buildings.length >= 6 && s.buildings.some((b) => b.type === 'market'),
  },
  {
    id: 'gather',
    kind: 'Mellékküldetés',
    title: 'Két dolgos kéz',
    text: 'Gyűjts kézzel 10 nyersanyagot.',
    reward: { wood: 20, stone: 20 },
    test: (s) => s.gathered >= 10,
  },
  {
    id: 'explore',
    kind: 'Mellékküldetés',
    title: 'A ködön túl',
    text: 'Fedezz fel 8 új mezőt.',
    reward: { food: 30, gold: 15 },
    test: (s) => s.explored >= 8,
  },
  {
    id: 'bonus',
    kind: 'Mellékküldetés',
    title: 'Nyüzsgő vásártér',
    text: 'Építs egy piacot.',
    reward: { food: 20 },
    test: (s) => s.buildings.some((b) => b.type === 'market'),
  },
];
export function claim(s, id) {
  const q = QUESTS.find((q) => q.id === id);
  if (!q || s.claimed.includes(id) || !q.test(s)) return false;
  s.claimed.push(id);
  for (const k in q.reward) s.resources[k] += q.reward[k];
  return true;
}
export function validate(input) {
  const s = input,
    n = (n) => Number.isFinite(n) && n >= 0 && n <= 1e15;
  const coord = (b) =>
    b &&
    Number.isInteger(b.x) &&
    Number.isInteger(b.y) &&
    b.x >= 0 &&
    b.x < SIZE &&
    b.y >= 0 &&
    b.y < SIZE;
  if (
    !s ||
    ![1, 2, 3, 4].includes(s.version) ||
    !s.resources ||
    !Object.keys(RES).every((k) => n(s.resources[k])) ||
    !Array.isArray(s.buildings) ||
    s.buildings.length > SIZE * SIZE ||
    !s.buildings.every((b) => coord(b) && Object.hasOwn(TYPES, b.type)) ||
    new Set(s.buildings.map((b) => key(b.x, b.y))).size !== s.buildings.length ||
    !Array.isArray(s.revealed) ||
    s.revealed.length > SIZE * SIZE ||
    !s.revealed.every(
      (k) => typeof k === 'string' && /^([0-9]|[1-3][0-9]|40),([0-9]|[1-3][0-9]|40)$/.test(k),
    ) ||
    !s.buildings.every((b) => s.revealed.includes(key(b.x, b.y))) ||
    !Array.isArray(s.claimed) ||
    !s.claimed.every((id) => QUESTS.some((q) => q.id === id)) ||
    !n(s.gathered) ||
    !n(s.explored) ||
    !n(s.last) ||
    s.last > Date.now() + 60000 ||
    !n(s.created)
  )
    throw Error('Érvénytelen vagy nem támogatott mentés.');
  if (s.version === 1) {
    s.resourceState = {};
    s.unlocked = ['starter'];
    if (s.revealed.some((k) => k.split(',').some((v) => Number(v) > 11))) s.unlocked.push('main');
    s.worldVersion = 1;
  }
  s.resourceState ||= {};
  s.unlocked ||= ['starter'];
  if (
    typeof s.resourceState !== 'object' ||
    Array.isArray(s.resourceState) ||
    Object.keys(s.resourceState).length > SIZE * SIZE * 3
  )
    throw Error('Hibás nyersanyagállapot.');
  for (const [id, state] of Object.entries(s.resourceState)) {
    const match = /^(tree|rock):(\d+):(\d+):(\d+)$/.exec(id);
    if (
      !match ||
      !state ||
      !Number.isInteger(state.hitsLeft) ||
      state.hitsLeft < 0 ||
      state.hitsLeft > (match?.[1] === 'tree' ? 72 : 120) ||
      typeof state.cleared !== 'boolean' ||
      state.cleared !== (state.hitsLeft === 0) ||
      !resourcesAt(Number(match[2]), Number(match[3]), s.worldVersion).some((r) => r.id === id)
    )
      throw Error('Hibás nyersanyagállapot.');
  }
  if (!Array.isArray(s.unlocked) || !s.unlocked.every((id) => ['starter', 'main'].includes(id)))
    throw Error('Hibás felfedezési állapot.');
  for (let i = 0; i < s.buildings.length; i++) {
    const b = s.buildings[i];
    b.id ||= `building:${i + 1}`;
    b.level ||= 1;
    if (
      typeof b.id !== 'string' ||
      !/^building:\d+$/.test(b.id) ||
      !Number.isInteger(b.level) ||
      b.level < 1 ||
      b.level > 10 ||
      terrainAt(s, b.x, b.y) !== 'grass'
    )
      throw Error('Hibás épületadat.');
  }
  if (![1, 2].includes(s.worldVersion)) throw Error('Nem támogatott térképverzió.');
  s.workers ||= [];
  if (!Array.isArray(s.workers) || s.workers.length > s.buildings.length * 3)
    throw Error('Hibás munkásadat.');
  const workerOwners = new Set();
  for (const w of s.workers) {
    const owner = s.buildings.find(
      (b) => b.id === w.buildingId && ['lumber', 'quarry'].includes(b.type),
    );
    w.id ||= `worker:${w.buildingId}:0`;
    if (
      !owner ||
      typeof w.id !== 'string' ||
      !/^worker:building:\d+:[0-2]$/.test(w.id) ||
      workerOwners.has(w.id) ||
      !n(w.x) ||
      !n(w.y) ||
      w.x >= SIZE ||
      w.y >= SIZE ||
      ![
        'idle',
        'outbound',
        'working',
        'returning',
        'resting',
        'inside',
        'entering',
        'emerging',
      ].includes(w.phase) ||
      !Number.isInteger(w.carried) ||
      w.carried < 0 ||
      w.carried > 100 ||
      (w.targetId != null && !/^((tree|rock):\d+:\d+:\d+)$/.test(w.targetId))
    )
      throw Error('Hibás munkásadat.');
    for (const k of ['workTime', 'workHits', 'rest', 'offlineRemainder', 'walkPhase'])
      if (w[k] != null && !n(w[k])) throw Error('Hibás munkásidő.');
    if (w.doorMotion) {
      const m = w.doorMotion;
      if (
        !['fromX', 'fromY', 'toX', 'toY', 't'].every((k) => Number.isFinite(m[k])) ||
        m.t < 0 ||
        m.t > 1 ||
        [m.fromX, m.toX, m.fromY, m.toY].some((v) => v < 0 || v >= SIZE)
      )
        throw Error('Hibás belépési mozgás.');
    }
    workerOwners.add(w.id);
  }
  if (new Set(s.buildings.map((b) => b.id)).size !== s.buildings.length)
    throw Error('Ismétlődő épületazonosító.');
  s.nextBuildingId = Math.max(
    Number(s.nextBuildingId) || 1,
    ...s.buildings.map((b) => Number(b.id.split(':')[1]) + 1),
  );
  if (!Number.isSafeInteger(s.nextBuildingId) || s.nextBuildingId > 1e9)
    throw Error('Hibás épületazonosító.');
  if (
    s.hero &&
    (!Number.isFinite(s.hero.x) ||
      !Number.isFinite(s.hero.y) ||
      s.hero.x < 0 ||
      s.hero.y < 0 ||
      s.hero.x >= SIZE ||
      s.hero.y >= SIZE)
  )
    throw Error('Hibás főszereplő-adat.');
  if (!s.hero) {
    const p = s.revealed
      .map((k) => k.split(',').map(Number))
      .filter(
        ([x, y]) =>
          terrainAt(s, x, y) === 'grass' && !s.buildings.some((b) => b.x === x && b.y === y),
      )
      .sort(
        (a, b) => Math.abs(a[0] - 4) + Math.abs(a[1] - 5) - Math.abs(b[0] - 4) - Math.abs(b[1] - 5),
      )[0] || [4, 5];
    s.hero = { x: p[0], y: p[1], direction: 'se' };
  }
  s.version = VERSION;
  return s;
}
