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
  if (c.storyRevision == null) {
    c.storyRevision = 2;
    c.carpenterInvited = !!s.adventure.sites.find((p) => p.id === 'house')?.inspected;
    c.carpenterIntro = c.completedOrders.includes('house-repair');
    c.advancedUnlocked =
      s.buildings.some((b) => ['kiln', 'forge'].includes(b.type)) ||
      ['charcoal', 'ironOre', 'iron'].some((k) => s.resources[k] > 0) ||
      s.production.jobs.some((j) => ['charcoal', 'iron'].includes(j.recipeId));
    if (c.completedOrders.includes('house-repair')) {
      const mill = s.buildings.find((b) => b.type === 'sawmill');
      if (mill) mill.level = Math.max(2, mill.level || 1);
    }
  }
  c.storyRevision = 3;
  for (const p of s.adventure.sites) p.noticeAccepted ??= !!p.inspected && !p.baseWelcomePending;
  const home = s.adventure.sites.find((p) => p.id === 'house');
  if (home?.restored) home.name = 'Az ács otthona';
  ensureMerchant(s);
  return s;
}
export function ensureMerchant(s) {
  const existing = s.adventure.trader,
    yard = s.adventure.sites.find((p) => p.id === 'tradepost');
  if (existing?.chapterMerchant && s.worldVersion === 4 && yard) {
    existing.x = yard.x - 1;
    existing.y = yard.y + 1;
  }
  if (
    !s.adventure.sites.some((p) => p.kind === 'bridge' && p.restored) ||
    s.adventure.trader?.chapterMerchant
  )
    return;
  const desired =
    s.worldVersion === 4 ? { x: 15, y: 16 } : s.adventure.sites.find((p) => p.id === 'tradepost');
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
  if (k === 'silver') return s.adventure.sites.some((p) => p.id === 'tradepost' && p.inspected);
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
      (id !== 'house-repair' || (hasType(s, 'sawmill') && s.chapter.carpenterIntro))
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
    if (p.id === 'house') p.name = 'Az ács otthona';
    p.buildingId = 'building:' + s.nextBuildingId++;
    s.buildings.push({ id: p.buildingId, type: p.type, x: p.x, y: p.y, level: 1 });
  }
  if (o.id === 'house-repair') {
    const mill = s.buildings.find((b) => b.type === 'sawmill');
    if (mill) mill.level = Math.max(2, mill.level || 1);
  }
  if (o.id.startsWith('repeat:')) s.chapter.repeatSerial++;
  else s.chapter.completedOrders.push(o.id);
  if (o.perk) s.chapter.perks[o.perk] = true;
  s.chapter.history.unshift({
    id: o.id,
    title: o.title,
    reward: o.reward,
    ...(o.benefit ? { benefit: o.benefit } : {}),
  });
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
  if (!s.chapter.completedOrders.includes('house-repair')) {
    if (carpenterWaiting(s)) return 'Valaki vár a bázisnál. Térj vissza, és beszélj vele.';
    if (!s.chapter.carpenterIntro)
      return 'A fűrészműhelytől egy rövid ösvény egy régi házhoz vezet.';
    return s.resources.planks < 3
      ? 'Az ács tetőjavításához készíts 3 deszkát; 8 kőre is szüksége lesz.'
      : 'Vidd a deszkát és a követ az ács házához: cserébe megjavítja a műhelyt.';
  }
  if (!hasType(s, 'mason'))
    return 'Az ács megmutatta a kőfaragóhoz vezető ösvényt. A faragott kő tartós javításokhoz kell.';
  if (!hasType(s, 'tradepost'))
    return 'Rendezd be a híd melletti kereskedőudvart a megrendelésekhez.';
  if (!s.chapter.completedOrders.includes('mason-sample'))
    return 'A kereskedő raktára beázik. Készíts 3 faragott követ és 2 deszkát a javításhoz.';
  if (!s.chapter.advancedUnlocked)
    return 'A raktár biztonságban van. A kereskedő új anyagokat vásárol; ezüstből a műhelybővítés munkadíját fizetheted.';
  if (!hasType(s, 'kiln')) return 'A műhelynegyed szénégetője tüzelőt adhat a következő munkához.';
  if (!hasType(s, 'forge')) return 'Deszkával és faragott kővel rendbe hozhatod a kovácsműhelyt.';
  if (!s.chapter.completedOrders.includes('forge-tools'))
    return 'A vasérces sziklából és faszénből készíts vasat az új szerszámokhoz.';
  return 'A műhelynegyed újra él. A kereskedőnél új anyagmegrendelés vár, a telepek tovább fejleszthetők.';
}
export function siteVisible(s, p) {
  return (
    !!p &&
    (s.chapter?.advancedUnlocked ||
      !(['kiln', 'forge'].includes(p.type) || p.kind === 'ore') ||
      p.restored)
  );
}
export function carpenterWaiting(s) {
  return (
    !!s.chapter?.carpenterInvited &&
    !s.chapter?.carpenterIntro &&
    !s.chapter.completedOrders.includes('house-repair')
  );
}
export function introduceCarpenter(s) {
  const base = s.adventure.sites.find((p) => p.type === 'hut');
  if (!base || !carpenterWaiting(s) || !siteNear(s, base)) return false;
  s.chapter.carpenterIntro = true;
  return true;
}
export function siteRequirement(s, p) {
  if (!siteVisible(s, p)) return false;
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
    ![2, 3].includes(c.storyRevision) ||
    !['carpenterInvited', 'carpenterIntro', 'advancedUnlocked'].every(
      (k) => typeof c[k] === 'boolean',
    ) ||
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

/** Exactly one player-facing task; background encounters remain saved, without competing prompts. */
export function currentTask(s) {
  const site = (id) => s.adventure.sites.find((p) => p.id === id),
    done = (id) => site(id)?.restored,
    make = (title, text, target, needs, benefit) => ({ title, text, target, needs, benefit });
  if (!hasType(s, 'hut'))
    return make('Egy biztos hely', 'Kövesd a parti ösvényt, és vizsgáld meg a régi házat.', 'camp');
  if (!hasType(s, 'farm'))
    return make(
      'Élelem a dolgozóknak',
      'A szigeten egy régi kert nyomai rejtőznek. Találd meg, és hozd rendbe.',
      'garden',
      site('garden')?.cost,
    );
  if (!hasType(s, 'lumber'))
    return make(
      'Induljon a favágás',
      'A közeli favágótelep újra elláthatja fával a szigetet.',
      'lumber',
      site('lumber')?.cost,
    );
  if (!hasType(s, 'quarry'))
    return make(
      'Kő a javításokhoz',
      'Valahol a szigeten egy elhagyott kőbánya rejtőzik. Fedezd fel, és hozd működésbe.',
      'quarry',
      site('quarry')?.cost,
    );
  if (!done('bridge'))
    return make(
      'Mi lehet a túlparton?',
      'Vizsgáld meg a leszakadt hidat, majd javítsd meg az átjárót.',
      'bridge',
      site('bridge')?.cost,
    );
  if (!hasType(s, 'sawmill'))
    return make(
      'A régi fűrészműhely',
      'A hídon túli műhelyt kitakarítva elindíthatod az egyszerű kézi fűrészelést.',
      'farm',
      site('farm')?.cost,
    );
  if (!s.chapter.completedOrders.includes('house-repair')) {
    if (carpenterWaiting(s))
      return make(
        'Vendég a bázisnál',
        'Az ajtón hagyott üzenet szerint az ács a bázisodnál keres. Térj vissza, és beszélj vele.',
        'camp',
      );
    if (!s.chapter.carpenterIntro)
      return make(
        'Egy elhagyott ház',
        'Egy viharvert ház még őrizheti a régi lakója nyomait. Keresd meg a szigeten.',
        'house',
      );
    return make(
      'Tető a mester feje fölé',
      'Vigyél 3 deszkát és 8 követ az ács házához. Cserébe jobb munkapadot és vezetősínt készít a fűrészműhelyedbe.',
      'house',
      { planks: 3, stone: 8 },
      'A működő 1. szintű fűrészműhely 2. szintű lesz: 30%-kal több deszkát tud készíteni ugyanannyi idő alatt.',
    );
  }
  if (!hasType(s, 'mason'))
    return make(
      'Tartósabb építkezés',
      'Az ács megmutatta a kőfaragóhoz vezető ösvényt. Hozd rendbe a műhelyt.',
      'mason',
      site('mason')?.cost,
    );
  if (!hasType(s, 'tradepost'))
    return make(
      'Találkozó a kereskedővel',
      'Rendezd be a híd melletti kereskedőudvart.',
      'tradepost',
      site('tradepost')?.cost,
    );
  if (firstChapterComplete(s))
    return make(
      'Az első fejezet teljes',
      'A telepek és műhelyek elkészültek. A kereskedő további megrendelései opcionálisak; új történeti fejezet még nincs ebben a változatban.',
      'tradepost',
    );
  const order = activeOrder(s, 'tradepost');
  if (order)
    return make(
      order.title,
      order.text,
      'tradepost',
      order.needs,
      order.benefit || 'A kereskedő kifizeti az átvett anyagok árát.',
    );
  return make(
    'A kereskedő raktára',
    'Keresd fel a kereskedőudvart, hogy megtudd, milyen javításhoz vásárol anyagot a kereskedő.',
    'tradepost',
  );
}

export function firstChapterComplete(s) {
  return (
    !!s.chapter?.completedOrders.includes('mason-sample') &&
    s.chapter.completedOrders.includes('house-repair') &&
    hasType(s, 'tradepost') &&
    ['farm', 'lumber', 'quarry', 'sawmill', 'mason'].every((type) =>
      s.buildings.some((b) => b.type === type && b.level >= 3),
    )
  );
}
