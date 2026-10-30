import {
  ensureChapter,
  chapterSitesForNewGame,
  chapterObjective,
  siteRequirement,
  validateChapter,
  ensureMerchant,
  siteVisible,
} from './chapter.js';
import { fresh, TYPES, afford, validate as validateCore } from './engine.js';
import { LOCATIONS, EARLY_SITES } from './island-layout.js';
import { ensureSupply } from './supply.js';
import { findPath, walkable } from './navigation.js';
import { terrain, key, SIZE, regionUnlocked } from './world.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
export const WRECK_SUPPLIES = Object.freeze({ wood: 8, stone: 3, food: 6, gold: 5 });
export const BASE_STARTER_SUPPLIES = Object.freeze({ wood: 30, stone: 18, food: 12 });
export function pendingBaseWelcome(s) {
  const site = s.adventure?.sites.find(
    (p) => p.baseWelcomePending && p.cacheClaimed && p.type === 'hut',
  );
  return site ? { siteId: site.id, reward: { ...site.baseWelcomeReward } } : null;
}
export function acknowledgeBaseWelcome(s, id) {
  const p = siteById(s, id);
  if (!p?.baseWelcomePending) return false;
  p.baseWelcomePending = false;
  return true;
}
export function freshAdventure(now = Date.now(), seed) {
  const s = fresh(now);
  Object.assign(s, {
    worldVersion: 4,
    buildings: [],
    workers: [],
    nextBuildingId: 206,
    resources: { wood: 0, stone: 0, food: 0, gold: 0 },
    hero: { x: 2, y: 10, angle: 0, direction: 'se' },
    revealed: [],
  });
  s.adventure = {
    revision: 2,
    kind: 'story',
    seed: seed ?? (globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] || Date.now() >>> 0),
    introSeen: false,
    sites: chapterSitesForNewGame(),
    items: {},
    decisions: [],
    eventsSeen: [],
    pending: null,
    nextEventAt: 12,
  };
  for (let x = 0; x < 5; x++)
    for (let y = 8; y <= 12; y++) if (Math.hypot(x - 2, y - 10) <= 2.4) s.revealed.push(key(x, y));
  return upgradeCampaign(s);
}
export function prepareCampaign(s) {
  if (s.adventure) return upgradeCampaign(s);
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
  return upgradeCampaign(s);
}
export function upgradeCampaign(s) {
  const a = s.adventure;
  if (!a || !Array.isArray(a.sites)) return s;
  ensureSupply(s);
  if (a.revision === 1) {
    for (const p of a.sites) if (p.type === 'hut') p.cacheClaimed = !!p.inspected;
    for (const template of EARLY_SITES) {
      if (a.sites.some((p) => p.id === template.id)) continue;
      let position;
      const candidates = [];
      for (let x = 1; x < 14; x++)
        for (let y = 2; y < 17; y++)
          if (
            terrain(x, y, s.worldVersion) === 'grass' &&
            !a.sites.some((p) => Math.hypot(p.x - x, p.y - y) < 1.7) &&
            !s.buildings.some((b) => Math.hypot(b.x - x, b.y - y) < 1.7) &&
            findPath(s, s.hero, { x, y })
          )
            candidates.push({ x, y });
      candidates.sort(
        (p, q) =>
          Math.hypot(p.x - template.x, p.y - template.y) -
          Math.hypot(q.x - template.x, q.y - template.y),
      );
      position = candidates[0];
      if (position)
        a.sites.push({
          ...clone(template),
          ...position,
          ...(template.type ? { number: s.nextBuildingId++ } : {}),
          restored: false,
          inspected: false,
        });
    }
    a.revision = 2;
  }
  for (const p of a.sites) {
    if (p.id === 'camp') p.name = 'Kezdőbázis';
  }
  a.playTime ??= 0;
  a.nextForageAt ??= 0;
  a.tutorialSeen ??= false;
  if (a.pending && !a.pending.target) assignEventTarget(s);
  ensureChapter(s);
  return s;
}
function stripIslands(s) {
  const c = clone(s);
  delete c.archive;
  delete c.otherIslands;
  return c;
}
export function startFreshAdventure(s) {
  const next = freshAdventure();
  next.archive = stripIslands(s);
  next.otherIslands = [
    ...(s.archive ? [stripIslands(s.archive)] : []),
    ...(s.otherIslands || []).map(stripIslands),
  ];
  return next;
}
export function switchCampaign(s, index = 0) {
  const saved = [...(s.archive ? [s.archive] : []), ...(s.otherIslands || [])];
  if (!saved.length) return startFreshAdventure(s);
  if (!Number.isInteger(index) || index < 0 || index >= saved.length)
    throw Error('Ismeretlen megőrzött sziget.');
  const next = prepareCampaign(stripIslands(saved[index]));
  next.archive = stripIslands(s);
  next.otherIslands = saved.filter((_, i) => i !== index).map(stripIslands);
  return next;
}
export function knownSite(s, p) {
  return siteVisible(s, p) && s.revealed.includes(key(p.x, p.y));
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
  if (s.chapter) return chapterObjective(s);
  if (!restoredType(s, 'hut')) return 'Keress menedéket a part mentén induló ösvényen.';
  if (!restoredType(s, 'farm'))
    return 'A készletek végesek. Keress tartós élelemforrást a sziget ezen részén.';
  if (!restoredType(s, 'lumber')) return 'Egy régi erdei telep újra munkát adhatna.';
  if (!s.adventure.sites.find((p) => p.kind === 'bridge' && p.restored))
    return 'A megszakadt út túloldalán folytatódhat a felfedezés.';
  return 'Kutasd tovább a sziget rejtett ösvényeit.';
}
export function inspectSite(s, id) {
  const p = siteById(s, id);
  if (!p || !knownSite(s, p) || Math.hypot(s.hero.x - p.x, s.hero.y - p.y) > 1.8)
    return { ok: false, text: 'Menj közelebb a helyszínhez.' };
  p.inspected = true;
  if (
    p.id === 'house' &&
    !s.chapter.completedOrders.includes('house-repair') &&
    !s.chapter.carpenterInvited
  ) {
    s.chapter.carpenterInvited = true;
    return {
      ok: true,
      text: 'A ház tetejét megtépázta a vihar. Hazafelé egy ács szólít meg: a bázisnál szeretne beszélni veled.',
    };
  }
  if (p.type === 'hut' && !p.cacheClaimed) {
    p.cacheClaimed = true;
    p.baseWelcomePending = true;
    p.baseWelcomeReward = { ...BASE_STARTER_SUPPLIES };
    for (const [kind, amount] of Object.entries(p.baseWelcomeReward)) s.resources[kind] += amount;
    return {
      ok: true,
      text: 'A házban használható készlet maradt: +30 fa, +18 kő, +12 élelem. Ez egyszeri tartalék, a bázis nem termel.',
    };
  }
  if (p.kind === 'ore') {
    if (!siteRequirement(s, p))
      return { ok: true, text: 'A kőfaragó segítségével fejthető ez a kemény ér.' };
    p.oreLeft ??= 72;
    if (p.oreLeft <= 0) return { ok: true, text: 'Ez az ér most kimerült.' };
    const amount = Math.min(4, p.oreLeft);
    p.oreLeft -= amount;
    s.resources.ironOre += amount;
    return { ok: true, text: `Vasércet fejtettél a sziklából: +${amount} vasérc.` };
  }
  if (p.kind === 'forage') {
    const wait = (s.adventure.nextForageAt || 0) - (s.adventure.playTime || 0);
    if (wait > 0)
      return {
        ok: true,
        text: `Itt most gyűjtöttél. Újabb adag kb. ${Math.ceil(wait)} másodperc aktív játék után lesz.`,
      };
    s.resources.food += 3;
    s.adventure.nextForageAt = (s.adventure.playTime || 0) + 30;
    return { ok: true, text: 'Összegyűjtöttél egy kis ehető tartalékot: +3 élelem.' };
  }
  if (p.kind === 'wreck' && !p.salvaged) {
    p.salvaged = true;
    for (const [resource, amount] of Object.entries(WRECK_SUPPLIES))
      s.resources[resource] += amount;
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
        ? 'A leszakadt gerendák elzárják az utat. A túlparton egy ösvény tűnik a ködbe. Vajon mit rejt odaát a sziget? Az átjáró megjavítható.'
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
  if (!siteRequirement(s, p))
    return { ok: false, reason: 'Előbb a kapcsolódó helyszínt kell helyreállítanod.' };
  if (p.order)
    return { ok: false, reason: 'A ház a helyszíni megrendelés teljesítésével állítható helyre.' };
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
  ensureMerchant(s);
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
// Contents are revealed only by reaching and inspecting the real object in the world.
const EVENTS = {
  visitor: {
    title: 'Valaki érkezett az ösvényen',
    text: 'Egy utazó megállt a régi ház közelében.',
  },
  traces: {
    title: 'Friss nyomok a földben',
    text: 'Az ösvénytől távolabb valami szokatlan nyomot hagyott.',
  },
  request: {
    title: 'Kérés a telepről',
    text: 'A dolgozók egy különös leletet tettek félre a telep közelében.',
  },
  tide: {
    title: 'A víz újabb holmit hozott',
    text: 'A part mentén érdemes nyitott szemmel járnod.',
  },
};
export function eventView(s) {
  const p = s.adventure.pending;
  return p ? { ...EVENTS[p.type], id: p.id } : null;
}
export function assignEventTarget(s) {
  const p = s.adventure.pending;
  if (!p || p.target) return;
  if (p.type === 'visitor' && !s.adventure.trader) p.type = 'traces';
  if (p.type === 'visitor' && s.adventure.trader) {
    p.target = { x: s.adventure.trader.x, y: s.adventure.trader.y };
    return;
  }
  const candidates = [];
  for (let x = 1; x < SIZE - 1; x++)
    for (let y = 1; y < SIZE - 1; y++) {
      const d = Math.hypot(x - s.hero.x, y - s.hero.y);
      if (
        d < 3 ||
        d > 8 ||
        !walkable(s, x, y) ||
        s.adventure.sites.some((v) => Math.hypot(v.x - x, v.y - y) < 1.4)
      )
        continue;
      const coast = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => terrain(x + dx, y + dy, s.worldVersion) === 'water');
      candidates.push({
        x,
        y,
        score:
          random(s) +
          (s.revealed.includes(key(x, y)) ? 2 : 0) +
          (p.type === 'tide' && !coast ? 4 : 0),
      });
    }
  candidates.sort((a, b) => a.score - b.score);
  const target = candidates.find((v) => findPath(s, s.hero, v));
  if (target) p.target = { x: target.x, y: target.y };
}
export function inspectDiscovery(s) {
  const p = s.adventure.pending;
  if (
    !p?.target ||
    !s.revealed.includes(key(p.target.x, p.target.y)) ||
    Math.hypot(s.hero.x - p.target.x, s.hero.y - p.target.y) > 1.6
  )
    return { ok: false, text: 'Előbb keresd meg és menj közelebb.' };
  let text;
  const multiplier = p.variant === 2 ? 1.2 : 1;
  if (p.type === 'visitor') {
    s.adventure.items.route = 1;
    s.adventure.decisions.push('welcomed-trader');
    text = 'Az utazó megmutat néhány régi útjelet. Az ajánlatait itt, a kocsijánál találod.';
  } else if (p.type === 'traces') {
    s.adventure.items.trail = 1;
    s.adventure.decisions.push('marked-traces');
    text = 'A nyomok egy megkopott jelhez vezettek. Most már felismered a hasonló útjeleket.';
  } else if (p.type === 'request') {
    s.adventure.items.keepsake = (s.adventure.items.keepsake || 0) + 1;
    text = 'Megvizsgáltad a félretett leletet. Egy megőrzésre érdemes tárgy került hozzád.';
  } else {
    const wood = 5 * multiplier,
      gold = 3 * multiplier;
    s.resources.wood += wood;
    if (s.chapter) s.resources.silver += 2;
    else s.resources.gold += gold;
    s.adventure.items.seal = 1;
    text = s.chapter
      ? `Kinyitottad a partra sodródott csomagot: +${wood} fa, +2 ezüst.`
      : `Kinyitottad a partra sodródott csomagot: +${wood} fa, +${gold} arany. A jelzését megőrizted.`;
  }
  s.adventure.eventsSeen.push(p.type + ':' + p.id);
  s.adventure.decisions.push('found:' + p.type);
  s.adventure.lastDiscovery = { title: EVENTS[p.type].title, text };
  s.adventure.pending = null;
  return { ok: true, text };
}
export function maybeEvent(s) {
  const a = s.adventure;
  if (a.pending) {
    assignEventTarget(s);
    return false;
  }
  if (s.explored < a.nextEventAt || !a.introSeen) return false;
  if (!restoredType(s, 'hut')) return false;
  const pool = ['traces', 'tide'];
  if (restoredType(s, 'lumber') && !s.chapter) pool.push('request', 'visitor');
  if (a.decisions.includes('welcomed-trader') && !s.chapter) pool.push('visitor');
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
  assignEventTarget(s);
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
  if (!t || Math.hypot(s.hero.x - t.x, s.hero.y - t.y) > 1.8) return [];
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
    ![1, 2].includes(a.revision) ||
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
      !['wreck', 'building', 'bridge', 'marker', 'forage', 'ore'].includes(p.kind) ||
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
    if (
      p.baseWelcomePending != null &&
      (typeof p.baseWelcomePending !== 'boolean' || p.type !== 'hut' || !p.cacheClaimed)
    )
      throw Error('Hibás báziskártya.');
    if (
      p.baseWelcomeReward &&
      (p.type !== 'hut' ||
        !['wood', 'stone', 'food'].every(
          (k) =>
            Number.isInteger(p.baseWelcomeReward[k]) &&
            p.baseWelcomeReward[k] >= 0 &&
            p.baseWelcomeReward[k] <= 100000,
        ) ||
        Object.keys(p.baseWelcomeReward).length !== 3)
    )
      throw Error('Hibás báziskészlet.');
    if (p.baseWelcomePending && !p.baseWelcomeReward) throw Error('Hiányzó báziskészlet.');
    if (
      p.kind === 'ore' &&
      p.oreLeft != null &&
      (!Number.isInteger(p.oreLeft) || p.oreLeft < 0 || p.oreLeft > 72)
    )
      throw Error('Hibás érckészlet.');
    ids.add(p.id);
    if (p.type && !Object.hasOwn(TYPES, p.type)) throw Error('Hibás helyszíntípus.');
    if (
      p.cost &&
      !Object.entries(p.cost).every(
        ([k, v]) => Object.hasOwn(s.resources, k) && Number.isFinite(v) && v >= 0 && v <= 100000,
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
  const economy = ensureSupply(s);
  if (
    economy.revision !== 1 ||
    !Number.isFinite(economy.supply) ||
    economy.supply < 0 ||
    economy.supply > 100
  )
    throw Error('Hibás ellátottság.');
  if (
    !Number.isFinite(a.playTime) ||
    a.playTime < 0 ||
    !Number.isFinite(a.nextForageAt) ||
    a.nextForageAt < 0 ||
    typeof a.tutorialSeen !== 'boolean'
  )
    throw Error('Hibás kalandidő.');
  if (
    a.pending?.target &&
    (!Number.isInteger(a.pending.target.x) ||
      !Number.isInteger(a.pending.target.y) ||
      a.pending.target.x < 0 ||
      a.pending.target.x >= SIZE ||
      a.pending.target.y < 0 ||
      a.pending.target.y >= SIZE)
  )
    throw Error('Hibás felfedezési cél.');
  if (
    a.lastDiscovery &&
    (typeof a.lastDiscovery.title !== 'string' ||
      a.lastDiscovery.title.length > 140 ||
      typeof a.lastDiscovery.text !== 'string' ||
      a.lastDiscovery.text.length > 600)
  )
    throw Error('Hibás felfedezési eredmény.');
  if (
    s.hero.siteWork &&
    (!s.adventure.sites.some((p) => p.id === s.hero.siteWork.siteId && p.kind === 'ore') ||
      !Number.isFinite(s.hero.siteWork.remaining) ||
      s.hero.siteWork.remaining < 0 ||
      s.hero.siteWork.remaining > 1.2 ||
      !Number.isFinite(s.hero.siteWork.elapsed) ||
      s.hero.siteWork.elapsed < 0 ||
      s.hero.siteWork.elapsed > 1.2)
  )
    throw Error('Hibás ércfejtési állapot.');
  validateChapter(s);
  if (s.otherIslands) {
    if (depth || !Array.isArray(s.otherIslands) || s.otherIslands.length > 20)
      throw Error('Hibás szigetarchívum.');
    for (const island of s.otherIslands) validateCampaign(island, 1);
  }
  if (s.archive) {
    if (depth) throw Error('Túl mély mentési archívum.');
    validateCampaign(s.archive, 1);
  }
  return s;
}
