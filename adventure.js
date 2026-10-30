import { fresh, TYPES, afford, validate as validateCore } from './engine.js';
import { LOCATIONS } from './island-layout.js';
import { terrain, key, SIZE, regionUnlocked } from './world.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
export function freshAdventure(now = Date.now(), seed) {
  const s = fresh(now);
  Object.assign(s, {
    worldVersion: 2,
    buildings: [],
    workers: [],
    nextBuildingId: 105,
    resources: { wood: 0, stone: 0, food: 8, gold: 0 },
    hero: { x: 2, y: 10, angle: 0, direction: 'se' },
    revealed: [],
  });
  s.adventure = {
    revision: 1,
    kind: 'story',
    seed: seed ?? (globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] || Date.now() >>> 0),
    introSeen: false,
    sites: LOCATIONS.map((p) => ({ ...clone(p), restored: false, inspected: false })),
    items: {},
    decisions: [],
    eventsSeen: [],
    pending: null,
    nextEventAt: 12,
  };
  for (let x = 0; x < 5; x++)
    for (let y = 8; y <= 12; y++) if (Math.hypot(x - 2, y - 10) <= 2.4) s.revealed.push(key(x, y));
  return s;
}
export function prepareCampaign(s) {
  if (s.adventure) return s;
  const sites = s.buildings.map((b) => ({
    id: 'legacy-' + b.id,
    kind: 'building',
    type: b.type,
    buildingId: b.id,
    x: b.x,
    y: b.y,
    name: TYPES[b.type].name,
    restored: true,
    inspected: true,
  }));
  const occupied = new Set(s.buildings.map((b) => key(b.x, b.y)));
  for (const p of LOCATIONS) {
    if (p.type && sites.some((v) => v.type === p.type)) continue;
    let point;
    for (let r = 0; r < 12 && !point; r++)
      for (let dx = -r; dx <= r && !point; dx++)
        for (let dy = -r; dy <= r && !point; dy++) {
          const x = p.x + dx,
            y = p.y + dy;
          if (
            terrain(x, y, s.worldVersion) === 'grass' &&
            !occupied.has(key(x, y)) &&
            s.buildings.every((b) => Math.hypot(x - b.x, y - b.y) > 1.3) &&
            Math.hypot(x - s.hero.x, y - s.hero.y) > 1.3 &&
            s.workers.every((w) => Math.hypot(x - w.x, y - w.y) > 1.1)
          )
            point = { x, y };
        }
    if (point) {
      sites.push({ ...clone(p), ...point, restored: false, inspected: false });
      occupied.add(key(point.x, point.y));
    }
  }
  s.adventure = {
    revision: 1,
    kind: 'legacy',
    seed: Date.now() >>> 0 || 1,
    introSeen: false,
    sites,
    items: {},
    decisions: [],
    eventsSeen: [],
    pending: null,
    nextEventAt: s.explored + 15,
  };
  return s;
}
export function switchCampaign(s) {
  const current = clone(s);
  delete current.archive;
  const next = s.archive ? prepareCampaign(clone(s.archive)) : freshAdventure();
  delete next.archive;
  next.archive = current;
  return next;
}
export function knownSite(s, p) {
  return s.revealed.includes(key(p.x, p.y));
}
export const siteById = (s, id) => s.adventure.sites.find((p) => p.id === id);
export const restoredType = (s, type) =>
  s.adventure.sites.some((p) => p.type === type && p.restored);
export function discoverSites(s) {
  const found = [];
  for (const p of s.adventure.sites)
    if (knownSite(s, p) && !p.discovered) {
      p.discovered = true;
      found.push(p);
    }
  return found;
}
export function objective(s) {
  const wreck = s.adventure.sites.find((p) => p.kind === 'wreck');
  if (wreck && !wreck.salvaged) return 'Vizsgáld meg a partra sodródott roncsot.';
  if (!restoredType(s, 'hut')) return 'Keress és állíts helyre egy menedéket.';
  if (!restoredType(s, 'lumber')) return 'Kövesd az erdei ösvényt. Keress egy régi telepet.';
  if (!s.adventure.sites.find((p) => p.kind === 'bridge' && p.restored))
    return 'Keresd meg és javítsd meg az átjárót.';
  if (!restoredType(s, 'farm')) return 'Fedezd fel a túlpartot, és gondoskodj az ellátásról.';
  return 'Kutasd tovább a sziget rejtett ösvényeit.';
}
export function inspectSite(s, id) {
  const p = siteById(s, id);
  if (!p || !knownSite(s, p) || Math.hypot(s.hero.x - p.x, s.hero.y - p.y) > 1.8)
    return { ok: false, text: 'Menj közelebb a helyszínhez.' };
  p.inspected = true;
  if (p.kind === 'wreck' && !p.salvaged) {
    p.salvaged = true;
    Object.assign(s.resources, {
      wood: s.resources.wood + 8,
      stone: s.resources.stone + 3,
      food: s.resources.food + 6,
      gold: s.resources.gold + 5,
    });
    s.adventure.items.fragment = 1;
    return {
      ok: true,
      text: 'Használható holmit találsz. Egy töredék arra utal, hogy nem te vagy az első ezen a parton.',
    };
  }
  if (p.kind === 'marker' && !p.salvaged) {
    if (!s.adventure.items.route && !s.adventure.items.trail)
      return {
        ok: true,
        text: 'A kopott jeleket még nem tudod elolvasni. Talán valaki ismeri őket.',
      };
    p.salvaged = true;
    s.resources.gold += 8;
    s.adventure.items.inscription = 1;
    s.adventure.decisions.push('read-marker');
    return {
      ok: true,
      text: 'A kopott jel irányt mutat. A sziget belseje felé folytatódik az ösvény.',
    };
  }
  return {
    ok: true,
    text: p.restored
      ? 'Ez a hely már újra él.'
      : p.kind === 'bridge'
        ? 'A gerendák cserére szorulnak. Az átjáró javítható.'
        : 'A falak állnak. Munkával újra használhatóvá teheted ezt a helyet.',
  };
}
export function siteCost(s, p) {
  const kit = (s.adventure.items['repair-kit'] || 0) > 0;
  return Object.fromEntries(
    Object.entries(p.cost || {}).map(([k, v]) => [k, Math.ceil(v * (kit ? 0.8 : 1))]),
  );
}
export function restoration(s, id) {
  const p = siteById(s, id);
  if (!p || p.restored || !p.cost || !p.inspected || !knownSite(s, p))
    return { ok: false, reason: 'Előbb vizsgáld meg a helyszínt.' };
  if (
    p.requires &&
    !s.adventure.sites.some((q) => (q.id === p.requires || q.type === p.requires) && q.restored)
  )
    return { ok: false, reason: 'Előbb működő favágótelepre van szükség.' };
  if (!afford(s, siteCost(s, p))) return { ok: false, reason: 'Még hiányzik néhány nyersanyag.' };
  if (Math.hypot(s.hero.x - p.x, s.hero.y - p.y) > 1.8)
    return { ok: false, reason: 'Menj közelebb a helyszínhez.' };
  return { ok: true, reason: 'Helyreállítható' };
}
export function restoreSite(s, id) {
  if (!restoration(s, id).ok) return false;
  const p = siteById(s, id);
  for (const [k, v] of Object.entries(siteCost(s, p))) s.resources[k] -= v;
  if (s.adventure.items['repair-kit'] > 0) s.adventure.items['repair-kit']--;
  p.restored = true;
  if (p.type) {
    p.buildingId = `building:${p.number || s.nextBuildingId++}`;
    s.nextBuildingId = Math.max(s.nextBuildingId, Number(p.buildingId.split(':')[1]) + 1);
    s.buildings.push({ id: p.buildingId, type: p.type, x: p.x, y: p.y, level: 1 });
  }
  if (p.kind === 'bridge' && !s.unlocked.includes('main')) s.unlocked.push('main');
  s.adventure.decisions.push('restore:' + p.id);
  return true;
}
function random(s) {
  let n = s.adventure.seed >>> 0;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  s.adventure.seed = n >>> 0 || 1;
  return (n >>> 0) / 4294967296;
}
// Internal event combinations. These definitions are not shown before discovery.
const EVENTS = {
  visitor: {
    title: 'Valaki érkezett az ösvényen',
    text: 'Egy utazó megáll a menedéknél. Szívesen cserélne, és ismeri a környék néhány régi jelét.',
    choices: [
      {
        id: 'trade',
        text: 'Cserélek vele',
        cost: { wood: 4 },
        reward: { food: 10 },
        flag: 'welcomed-trader',
      },
      { id: 'listen', text: 'Inkább útbaigazítást kérek', flag: 'heard-route', item: 'route' },
    ],
  },
  traces: {
    title: 'Friss nyomok a földben',
    text: 'Az ösvény mellett szokatlan nyomokat találsz. Egy kis kitérő talán elárulhat valamit.',
    choices: [
      {
        id: 'follow',
        text: 'Megjelölöm, hogy visszataláljak',
        flag: 'marked-traces',
        item: 'trail',
      },
      {
        id: 'study',
        text: 'Előbb alaposan körülnézek',
        reward: { stone: 4 },
        flag: 'careful-observer',
      },
    ],
  },
  request: {
    title: 'Kérés a telepről',
    text: 'Egy dolgozó különös tárgyra bukkant a munka közben. Segítséget kér az átvizsgálásához.',
    choices: [
      {
        id: 'help',
        text: 'Élelemmel segítek',
        cost: { food: 3 },
        item: 'keepsake',
        flag: 'helped-worker',
      },
      {
        id: 'record',
        text: 'Együtt feljegyezzük a lelőhelyet',
        reward: { wood: 3 },
        flag: 'recorded-find',
      },
    ],
  },
  tide: {
    title: 'A víz újabb holmit hozott',
    text: 'A parton egy kis csomag akadt fenn. Nem tudni, honnan sodródott ide.',
    choices: [
      {
        id: 'open',
        text: 'Óvatosan kinyitom',
        reward: { wood: 5, gold: 3 },
        flag: 'opened-parcel',
      },
      { id: 'keep', text: 'Megőrzöm a rajta lévő jelzést', item: 'seal', flag: 'kept-seal' },
    ],
  },
};
export function eventView(s) {
  const p = s.adventure.pending;
  return p ? { ...EVENTS[p.type], id: p.id, variant: p.variant } : null;
}
export function maybeEvent(s) {
  const a = s.adventure;
  if (a.pending || s.explored < a.nextEventAt || !a.introSeen) return false;
  const pool = ['traces', 'tide'];
  if (restoredType(s, 'lumber')) pool.push('request', 'visitor');
  if (a.decisions.includes('welcomed-trader')) pool.push('visitor');
  const recent = a.eventsSeen.slice(-2).map((v) => v.split(':')[0]),
    eligible = pool.filter((t) => !recent.includes(t));
  const type = (eligible.length ? eligible : pool)[
    Math.floor(random(s) * (eligible.length || pool.length))
  ];
  a.pending = { id: `event:${a.eventsSeen.length + 1}`, type, variant: Math.floor(random(s) * 3) };
  a.nextEventAt = s.explored + 10 + Math.floor(random(s) * 13);
  if (type === 'visitor') {
    const camp =
      a.sites.find((p) => p.type === 'hut' && p.restored) || a.sites.find((p) => p.restored);
    if (camp)
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [2, 0],
        [0, 2],
      ]) {
        const x = camp.x + dx,
          y = camp.y + dy;
        if (
          terrain(x, y, s.worldVersion) === 'grass' &&
          !s.buildings.some((b) => b.x === x && b.y === y)
        ) {
          const catalog = Object.keys(TRADES),
            first = Math.floor(random(s) * catalog.length),
            second = (first + 1 + Math.floor(random(s) * (catalog.length - 1))) % catalog.length;
          a.trader = {
            x,
            y,
            active: true,
            offers: [catalog[first], catalog[second]],
            used: [],
            stock: 2,
          };
          break;
        }
      }
  }
  return true;
}
export function chooseEvent(s, choiceId) {
  const e = eventView(s),
    choice = e?.choices.find((c) => c.id === choiceId);
  if (!choice || !afford(s, choice.cost || {})) return false;
  for (const [k, v] of Object.entries(choice.cost || {})) s.resources[k] -= v;
  for (const [k, v] of Object.entries(choice.reward || {}))
    s.resources[k] += v * (e.variant === 2 ? 1.2 : 1);
  if (choice.item) s.adventure.items[choice.item] = (s.adventure.items[choice.item] || 0) + 1;
  s.adventure.decisions.push(choice.flag);
  s.adventure.eventsSeen.push(s.adventure.pending.type + ':' + s.adventure.pending.id);
  s.adventure.pending = null;
  return true;
}
const TRADES = {
  'wood-food': { text: '5 fa → 8 élelem', cost: { wood: 5 }, reward: { food: 8 } },
  'stone-food': { text: '4 kő → 7 élelem', cost: { stone: 4 }, reward: { food: 7 } },
  'gold-wood': { text: '3 arany → 10 fa', cost: { gold: 3 }, reward: { wood: 10 } },
  'repair-kit': { text: '4 arany → javítókészlet', cost: { gold: 4 }, item: 'repair-kit' },
  'food-gold': { text: '6 élelem → 4 arany', cost: { food: 6 }, reward: { gold: 4 } },
};
export function traderOffers(s) {
  const t = s.adventure.trader;
  if (!t) return [];
  return (t.offers || ['wood-food', 'repair-kit'])
    .filter((id) => TRADES[id])
    .map((id) => ({ id, ...TRADES[id], used: t.used?.includes(id) || false }));
}
export function trade(s, id) {
  const t = s.adventure.trader,
    offer = traderOffers(s).find((o) => o.id === id);
  if (!t || !offer || offer.used || (t.stock ?? 2) <= 0 || !afford(s, offer.cost)) return false;
  for (const [k, v] of Object.entries(offer.cost)) s.resources[k] -= v;
  for (const [k, v] of Object.entries(offer.reward || {})) s.resources[k] += v;
  if (offer.item) s.adventure.items[offer.item] = (s.adventure.items[offer.item] || 0) + 1;
  t.used ||= [];
  t.used.push(id);
  t.stock = (t.stock ?? 2) - 1;
  return true;
}
export function validateCampaign(s, depth = 0) {
  validateCore(s);
  prepareCampaign(s);
  const a = s.adventure;
  if (
    a.revision !== 1 ||
    !['story', 'legacy'].includes(a.kind) ||
    !Number.isInteger(a.seed) ||
    a.seed < 0 ||
    a.seed > 4294967295 ||
    typeof a.introSeen !== 'boolean' ||
    !Array.isArray(a.sites) ||
    a.sites.length > SIZE * SIZE + 10 ||
    !Array.isArray(a.decisions) ||
    a.decisions.length > 10000 ||
    !a.decisions.every((v) => typeof v === 'string' && v.length < 100) ||
    !Array.isArray(a.eventsSeen) ||
    a.eventsSeen.length > 10000 ||
    !Number.isFinite(a.nextEventAt) ||
    a.nextEventAt < 0
  )
    throw Error('Hibás kalandmentés.');
  const ids = new Set();
  for (const p of a.sites) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !/^[a-z0-9:-]+$/.test(p.id) ||
      ids.has(p.id) ||
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x >= SIZE ||
      p.y >= SIZE ||
      !['wreck', 'building', 'bridge', 'marker'].includes(p.kind) ||
      typeof p.restored !== 'boolean' ||
      typeof p.inspected !== 'boolean'
    )
      throw Error('Hibás helyszínadat.');
    if (
      typeof p.name !== 'string' ||
      p.name.length > 140 ||
      (p.art != null && (!Number.isInteger(p.art) || p.art < 0 || p.art > 8)) ||
      (p.number != null && (!Number.isInteger(p.number) || p.number < 1 || p.number > 100000000))
    )
      throw Error('Hibás helyszínleírás.');
    if (
      p.restored &&
      p.kind === 'building' &&
      !s.buildings.some(
        (b) => b.id === p.buildingId && b.type === p.type && b.x === p.x && b.y === p.y,
      )
    )
      throw Error('Hiányzó helyreállított épület.');
    ids.add(p.id);
    if (p.type && !Object.hasOwn(TYPES, p.type)) throw Error('Hibás helyszíntípus.');
    if (
      p.cost &&
      !Object.entries(p.cost).every(
        ([k, v]) =>
          ['wood', 'stone', 'food', 'gold'].includes(k) &&
          Number.isFinite(v) &&
          v >= 0 &&
          v <= 100000,
      )
    )
      throw Error('Hibás javítási költség.');
  }
  if (
    a.pending &&
    (!EVENTS[a.pending.type] ||
      !Number.isInteger(a.pending.variant) ||
      a.pending.variant < 0 ||
      a.pending.variant > 2)
  )
    throw Error('Hibás eseményadat.');
  if (
    !a.items ||
    typeof a.items !== 'object' ||
    Array.isArray(a.items) ||
    !Object.entries(a.items).every(
      ([k, v]) => /^[a-z-]+$/.test(k) && Number.isInteger(v) && v >= 0 && v < 100000,
    )
  )
    throw Error('Hibás tárgyadat.');
  if (
    a.trader &&
    (!Number.isInteger(a.trader.x) ||
      !Number.isInteger(a.trader.y) ||
      a.trader.x < 0 ||
      a.trader.x >= SIZE ||
      a.trader.y < 0 ||
      a.trader.y >= SIZE ||
      typeof a.trader.active !== 'boolean' ||
      (a.trader.stock != null &&
        (!Number.isInteger(a.trader.stock) || a.trader.stock < 0 || a.trader.stock > 2)))
  )
    throw Error('Hibás kereskedőadat.');
  if (
    a.trader?.offers &&
    (!Array.isArray(a.trader.offers) ||
      a.trader.offers.length > 2 ||
      !a.trader.offers.every((id) => TRADES[id]) ||
      new Set(a.trader.offers).size !== a.trader.offers.length)
  )
    throw Error('Hibás ajánlat.');
  if (a.trader?.used && (!Array.isArray(a.trader.used) || !a.trader.used.every((id) => TRADES[id])))
    throw Error('Hibás vásárlási adat.');
  if (s.hero.job) {
    const j = s.hero.job;
    if (
      !/^((tree|rock):\d+:\d+:\d+)$/.test(j.targetId) ||
      !Number.isFinite(j.clock) ||
      j.clock < 0 ||
      j.clock > 100000 ||
      !Number.isInteger(j.left) ||
      j.left < 0 ||
      j.left > 6 ||
      !Number.isFinite(j.boost) ||
      j.boost < 1 ||
      j.boost > 2.4 ||
      !Number.isFinite(j.nextImpact) ||
      j.nextImpact < 0 ||
      j.nextImpact > 100001
    )
      throw Error('Hibás gyűjtési folyamat.');
  }
  if (s.archive) {
    if (depth) throw Error('Túl mély mentési archívum.');
    validateCampaign(s.archive, 1);
  }
  return s;
}
