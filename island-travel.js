import { tick } from './engine.js';
import { produceOfflineWorkers } from './workers.js';
import { newEchoWorld, projectDone, nearVoyageSite } from './voyage.js';
const clone = (x) => JSON.parse(JSON.stringify(x));
export const WORLD_KEYS = [
  'worldVersion',
  'buildings',
  'workers',
  'production',
  'nextBuildingId',
  'hero',
  'revealed',
  'resourceState',
  'unlocked',
  'last',
  'adventure',
];
function capture(s, now) {
  const out = { accountedAt: Math.max(s.last, now) };
  for (const k of WORLD_KEYS) out[k] = clone(s[k]);
  return out;
}
export function awayEconomy(s) {
  const home = s.voyage?.currentIsland === 'echo' && s.voyage.worlds.home;
  return home ? { ...s, ...home, resources: s.resources, voyage: undefined } : s;
}
export function settleAway(s, now = Date.now()) {
  const home = s.voyage?.currentIsland === 'echo' && s.voyage.worlds.home;
  if (!home) return 0;
  const temp = awayEconomy(s);
  temp.last = home.accountedAt;
  const dt = tick(temp, now, false);
  produceOfflineWorkers(temp, dt);
  for (const k of ['production', 'workers', 'resourceState']) home[k] = temp[k];
  home.last = home.accountedAt = Math.max(home.accountedAt, now);
  return dt;
}
export function beginSailing(s, to) {
  const v = s.voyage,
    port = v?.currentIsland === 'home' ? 'harbour' : 'echo-landing';
  if (
    !v ||
    v.travel ||
    !['home', 'echo'].includes(to) ||
    to === v.currentIsland ||
    !projectDone(s, 'boat-rigging') ||
    !nearVoyageSite(s, port)
  )
    return false;
  v.travel = { from: v.currentIsland, to, elapsed: 0, total: 3 };
  return true;
}
export function advanceSailing(s, dt, now = Date.now()) {
  const v = s.voyage,
    t = v?.travel;
  if (!t) return false;
  t.elapsed = Math.min(t.total, t.elapsed + Math.max(0, Math.min(0.12, dt)));
  if (t.elapsed < t.total) return false;
  settleAway(s, now);
  const from = t.from,
    to = t.to;
  v.worlds[from] = capture(s, now);
  const next = v.worlds[to] || newEchoWorld(s, now);
  for (const k of WORLD_KEYS) s[k] = clone(next[k]);
  s.last = now;
  v.worlds[to] = null;
  v.currentIsland = to;
  v.travel = null;
  if (to === 'home') {
    v.returned = true;
    s.hero = { x: 8, y: 14, angle: 0, direction: 'se' };
  } else {
    s.hero = { x: 3, y: 11, angle: 0, direction: 'se' };
  }
  return true;
}
export function validateStoredWorlds(s, validate, depth) {
  const v = s.voyage;
  if (!v) return;
  if (Object.keys(v.worlds).some((k) => !['home', 'echo'].includes(k)))
    throw Error('Ismeretlen hajózási sziget.');
  for (const id of ['home', 'echo']) {
    const w = v.worlds[id];
    if (!w) continue;
    if (
      id === v.currentIsland ||
      Object.keys(w).some((k) => !WORLD_KEYS.includes(k) && k !== 'accountedAt') ||
      !Number.isFinite(w.accountedAt) ||
      w.accountedAt < 0 ||
      w.accountedAt > Date.now() + 60000 ||
      w.worldVersion !== (id === 'home' ? 4 : 5)
    )
      throw Error('Hibás megőrzött hajózási sziget.');
    const temp = {
      ...clone(s),
      ...clone(w),
      archive: undefined,
      otherIslands: undefined,
      voyage: { ...clone(v), currentIsland: id, travel: null, worlds: { home: null, echo: null } },
    };
    validate(temp, depth + 1, true);
  }
  if (v.currentIsland === 'echo' && !v.worlds.home) throw Error('Hiányzik az otthoni sziget.');
}
