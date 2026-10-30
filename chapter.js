import { CHAPTER_SITES, STORY_ORDERS, REPEAT_ORDERS, SHOP, RECIPES, EXTRA_RES } from './content.js';
import { terrain, key } from './world.js';
import { canPay, payMaterials, ensureProduction } from './production.js';
const clone = (v) => JSON.parse(JSON.stringify(v));
export const hasType = (s, type) => s.buildings.some((b) => b.type === type);
export function chapterSitesForNewGame() {
  return CHAPTER_SITES.map((p) => ({ ...clone(p), restored: false, inspected: false }));
}
export function ensureChapter(s) {
  for (const k of Object.keys(EXTRA_RES)) s.resources[k] ??= 0;
  if (!s.adventure) return s;
  const c = (s.chapter ||= {
    revision: 1,
    completedOrders: [],
    repeatSerial: 0,
    perks: {},
    history: [],
  });
  ensureProduction(s);
  if (!c.migrated) {
    const oldFarm = s.adventure.sites.find((p) => p.id === 'farm' && p.type === 'farm');
    if (oldFarm) {
      oldFarm.type = 'sawmill';
      oldFarm.name = 'Régi fűrészműhely';
      oldFarm.cost = { wood: 12, stone: 6 };
      const b = s.buildings.find((b) => b.id === oldFarm.buildingId);
      if (b) b.type = 'sawmill';
    }
    for (const template of CHAPTER_SITES) {
      if (s.adventure.sites.some((p) => p.id === template.id)) continue;
      if (!['house', 'mason', 'tradepost', 'ore', 'kiln', 'forge'].includes(template.id)) continue;
      let point;
      for (let r = 0; r < 9 && !point; r++)
        for (let dx = -r; dx <= r && !point; dx++)
          for (let dy = -r; dy <= r && !point; dy++) {
            const x = template.x + dx,
              y = template.y + dy;
            if (
              terrain(x, y, s.worldVersion) === 'grass' &&
              s.adventure.sites.every((p) => Math.hypot(p.x - x, p.y - y) > 1.7) &&
              s.buildings.every((b) => Math.hypot(b.x - x, b.y - y) > 1.7)
            )
              point = { x, y };
          }
      if (point)
        s.adventure.sites.push({
          ...clone(template),
          ...point,
          ...(template.type ? { number: s.nextBuildingId++ } : {}),
          restored: false,
          inspected: false,
        });
    }
    for (const p of s.adventure.sites) {
      const fresh = CHAPTER_SITES.find((q) => q.id === p.id);
      if (
        fresh &&
        !p.restored &&
        ['camp', 'garden', 'lumber', 'quarry', 'bridge', 'farm'].includes(p.id)
      )
        p.cost = clone(fresh.cost || {});
    }
    c.migrated = true;
  }
  ensureMerchant(s);
  return s;
}
export function ensureMerchant(s) {
  if (
    !s.adventure.sites.some((p) => p.kind === 'bridge' && p.restored) ||
    s.adventure.trader?.chapterMerchant
  )
    return;
  const desired =
    s.worldVersion === 4 ? { x: 16, y: 13 } : s.adventure.sites.find((p) => p.id === 'tradepost');
  if (!desired) return;
  let point = { x: desired.x, y: desired.y };
  if (s.worldVersion !== 4) {
    const candidates = [];
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++) {
        const x = desired.x + dx,
          y = desired.y + dy;
        if (
          terrain(x, y, s.worldVersion) === 'grass' &&
          s.adventure.sites.every((p) => Math.hypot(p.x - x, p.y - y) > 1.3) &&
          s.buildings.every((b) => Math.hypot(b.x - x, b.y - y) > 1.3)
        )
          candidates.push({ x, y });
      }
    point = candidates.sort(
      (a, b) =>
        Math.hypot(a.x - desired.x, a.y - desired.y) - Math.hypot(b.x - desired.x, b.y - desired.y),
    )[0];
    if (!point) return;
  }
  s.adventure.trader = {
    ...(s.adventure.trader || {}),
    x: point.x,
    y: point.y,
    active: true,
    chapterMerchant: true,
    offers: [],
    used: [],
    stock: 0,
  };
}
export function knownMaterial(s, k) {
  if (['wood', 'stone', 'food'].includes(k) || (s.resources[k] || 0) > 0) return true;
  if (k === 'silver')
    return s.adventure.sites.some((p) => ['house', 'tradepost'].includes(p.id) && p.inspected);
  const type = {
    planks: 'sawmill',
    cutStone: 'mason',
    charcoal: 'kiln',
    ironOre: 'forge',
    iron: 'forge',
  }[k];
  return (
    !!type && s.adventure.sites.some((p) => p.type === type && s.revealed.includes(key(p.x, p.y)))
  );
}
function siteNear(s, p) {
  return (
    p && s.revealed.includes(key(p.x, p.y)) && Math.hypot(s.hero.x - p.x, s.hero.y - p.y) <= 1.8
  );
}
export function activeOrder(s, siteId) {
  const c = s.chapter;
  if (!c) return null;
  for (const [id, o] of Object.entries(STORY_ORDERS))
    if (
      o.site === siteId &&
      !c.completedOrders.includes(id) &&
      (!o.requires || hasType(s, o.requires)) &&
      (id !== 'house-repair' || hasType(s, 'sawmill'))
    ) {
      const p = s.adventure.sites.find((p) => p.id === siteId);
      if (!p?.inspected) return null;
      return { id, ...o };
    }
  if (
    siteId !== 'tradepost' ||
    !hasType(s, 'tradepost') ||
    !c.completedOrders.includes('house-repair')
  )
    return null;
  const possible = REPEAT_ORDERS.filter((o) => hasType(s, o.requires));
  if (!possible.length) return null;
  return {
    id: 'repeat:' + c.repeatSerial,
    site: 'tradepost',
    ...possible[c.repeatSerial % possible.length],
  };
}
export function deliverOrder(s, siteId, orderId) {
  const p = s.adventure.sites.find((p) => p.id === siteId),
    o = activeOrder(s, siteId);
  if (!siteNear(s, p) || !o || o.id !== orderId || !canPay(s, o.needs)) return false;
  payMaterials(s, o.needs);
  for (const [k, n] of Object.entries(o.reward)) s.resources[k] += n;
  if (o.restore && !p.restored) {
    p.restored = true;
    p.buildingId = 'building:' + s.nextBuildingId++;
    s.buildings.push({ id: p.buildingId, type: p.type, x: p.x, y: p.y, level: 1 });
  }
  if (o.id.startsWith('repeat:')) s.chapter.repeatSerial++;
  else s.chapter.completedOrders.push(o.id);
  if (o.perk) s.chapter.perks[o.perk] = true;
  s.chapter.history.unshift({ id: o.id, title: o.title, reward: o.reward });
  s.chapter.history = s.chapter.history.slice(0, 12);
  return true;
}
export function buyEquipment(s, id) {
  const offer = SHOP[id],
    p = s.adventure.sites.find((p) => p.id === 'tradepost');
  if (
    !offer ||
    !p?.restored ||
    !siteNear(s, p) ||
    s.chapter.perks[offer.perk] ||
    !canPay(s, offer.cost)
  )
    return false;
  payMaterials(s, offer.cost);
  s.chapter.perks[offer.perk] = true;
  return true;
}
export function chapterObjective(s) {
  const site = (id) => s.adventure.sites.find((p) => p.id === id);
  if (!hasType(s, 'hut')) return 'Kövesd a parti ösvényt, és rendezd be a régi házat.';
  if (!hasType(s, 'farm') || !hasType(s, 'lumber'))
    return 'A bázistól két rövid út indul: a kert és a fatelep újra működhet.';
  if (!hasType(s, 'quarry')) return 'A fateleptől az északi ösvény a régi kőfejtőhöz vezet.';
  if (!site('bridge')?.restored) return 'Javítsd meg a leszakadt hidat a két telep anyagaiból.';
  if (!hasType(s, 'sawmill')) return 'A hídon túli főút egy régi fűrészműhelyhez vezet.';
  if (!s.chapter.completedOrders.includes('house-repair'))
    return s.resources.planks < 3
      ? 'Készíts három deszkát a műhelyben, és keresd fel az ács házát.'
      : 'Az ács házánál add át a deszkát és a követ a javításhoz.';
  if (!hasType(s, 'mason'))
    return 'Az ács újra munkába állt. Az északi műhelyben kőfaragás indulhat.';
  if (!hasType(s, 'tradepost'))
    return 'Rendezd be a híd melletti kereskedőudvart a megrendelésekhez.';
  if (!s.chapter.completedOrders.includes('mason-sample'))
    return 'Készíts falazócsomagot, és add át a kereskedőudvarban.';
  if (!hasType(s, 'kiln')) return 'A műhelynegyed szénégetője tüzelőt adhat a következő munkához.';
  if (!hasType(s, 'forge')) return 'Deszkával és faragott kővel rendbe hozhatod a kovácsműhelyt.';
  if (!s.chapter.completedOrders.includes('forge-tools'))
    return 'A vasérces sziklából és faszénből készíts vasat az új szerszámokhoz.';
  return 'A műhelynegyed újra él. A kereskedőnél új anyagmegrendelés vár, a telepek tovább fejleszthetők.';
}
export function siteRequirement(s, p) {
  if (!p.requires) return true;
  return s.adventure.sites.some(
    (q) => (q.id === p.requires || q.type === p.requires) && q.restored,
  );
}
export function validateChapter(s) {
  if (!s.chapter) return;
  const c = s.chapter;
  if (
    c.revision !== 1 ||
    typeof c.migrated !== 'boolean' ||
    !Array.isArray(c.completedOrders) ||
    new Set(c.completedOrders).size !== c.completedOrders.length ||
    !c.completedOrders.every((id) => STORY_ORDERS[id]) ||
    !Number.isSafeInteger(c.repeatSerial) ||
    c.repeatSerial < 0 ||
    !c.perks ||
    typeof c.perks !== 'object' ||
    Array.isArray(c.perks) ||
    !Object.entries(c.perks).every(
      ([k, v]) => ['tools', 'fastCraft'].includes(k) && typeof v === 'boolean',
    ) ||
    !Array.isArray(c.history) ||
    c.history.length > 12 ||
    !c.history.every(
      (h) =>
        h &&
        typeof h.id === 'string' &&
        h.id.length < 100 &&
        typeof h.title === 'string' &&
        h.title.length < 150 &&
        h.reward &&
        Object.entries(h.reward).every(
          ([k, n]) => Object.hasOwn(s.resources, k) && Number.isFinite(n) && n >= 0 && n < 100000,
        ),
    )
  )
    throw Error('Hibás fejezetmentés.');
}
