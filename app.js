import { RECIPES, SHOP } from './content.js';
import { queueCraft, craftSpeed } from './production.js';
import {
  activeOrder,
  deliverOrder,
  buyEquipment,
  knownMaterial,
  ensureMerchant,
} from './chapter.js';
import { materialIcon, materialAmounts, iconSource } from './ui-icons.js';
import { siteReadiness, readySites } from './site-actions.js';
import { buildingFrame, buildingArt } from './art.js';
import { queueGather, advanceGathering } from './gathering.js';
import { loadGame, saveGame, importGame } from './save.js';
import { setupOffline } from './updates.js';
import {
  TYPES,
  RES,
  afford,
  upgrade,
  upgradeCost,
  productionMultiplier,
  buildingRate,
  workerCount,
  tick,
  resourceTarget,
  harvestHit,
} from './engine.js';
import { resourcesAt, key, terrainAt } from './world.js';
import {
  findPath,
  walkable,
  smoothPath,
  resourcePath,
  revealAround,
  advanceHero,
  driveHero,
} from './navigation.js';
import { updateWorkers, produceOfflineWorkers, syncWorkers, supplyFactor } from './workers.js';
import {
  freshAdventure,
  switchCampaign,
  startFreshAdventure,
  knownSite,
  siteById,
  inspectSite,
  pendingBaseWelcome,
  acknowledgeBaseWelcome,
  restoration,
  restoreSite,
  objective,
  discoverSites,
  eventView,
  maybeEvent,
  inspectDiscovery,
  restoredType,
  siteCost,
  traderOffers,
  trade,
} from './adventure.js';
import { supplySummary } from './supply.js';
import { createRenderer } from './renderer.js';
import { attachGestures } from './gestures.js';
const $ = (id) => document.getElementById(id),
  escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const loaded = loadGame();
let s = loaded.state,
  saveOK = loaded.writable,
  previouslyHidden = document.hidden;
const elapsed = tick(s, Date.now(), false);
produceOfflineWorkers(s, elapsed);
let route = [],
  siteTarget = null,
  selected = null,
  selectedWorker = null,
  encounterTarget = null,
  sheet = null,
  drive = { x: 0, y: 0 },
  toastTimer,
  lastCell = '',
  lastUI = 0,
  ready = false;
const camera = {
  zoom: 1.08,
  x: 0,
  y: 0,
  anchorY: 0.53,
  follow: true,
  focus: { x: s.hero.x, y: s.hero.y },
};
const cost = (c) =>
  Object.entries(c || {})
    .map(([k, v]) => `${Math.ceil(v)} ${RES[k][1]}`)
    .join('  ');
const toastQueue = [];
let currentToast = '';
function nextToast() {
  clearTimeout(toastTimer);
  const entry = toastQueue.shift();
  if (!entry) {
    currentToast = '';
    $('toast').classList.remove('show');
    return;
  }
  currentToast = entry;
  $('toast').textContent = entry;
  $('toast').classList.add('show');
  toastTimer = setTimeout(
    nextToast,
    Math.min(14000, Math.max(9000, entry.split(' ').length * 350)),
  );
}
function toast(text) {
  if (text === currentToast || toastQueue.includes(text)) return;
  toastQueue.push(text);
  if (!currentToast) nextToast();
}
$('toast').onclick = nextToast;
function save() {
  if (!saveOK) return false;
  try {
    saveGame(s);
    $('savestatus').textContent = 'Mentve';
    return true;
  } catch {
    toast('A mentés nem sikerült. Exportáld a játékállást.');
    return false;
  }
}
function settle() {
  const dt = tick(s, Date.now(), false);
  if (previouslyHidden) produceOfflineWorkers(s, dt);
}
function closeSheet() {
  sheet = null;
  $('sheet').hidden = true;
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
function openSheet(tab) {
  drive = { x: 0, y: 0 };
  if (sheet === tab) {
    closeSheet();
    return;
  }
  sheet = tab;
  $('sheet').hidden = false;
  $('sheettitle').textContent =
    tab === 'sites'
      ? 'A felfedezett sziget'
      : tab === 'inventory'
        ? 'Hátizsák'
        : tab === 'supply'
          ? 'Munka és ellátás'
          : 'Feladatok és nyomok';
  renderPanel();
  document
    .querySelectorAll('[data-tab]')
    .forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.tab === tab)));
}
function siteThumbnail(p) {
  const b = p.buildingId ? s.buildings.find((b) => b.id === p.buildingId) : null;
  const art = p.type ? buildingArt(p.type, b?.level || 1) : null;
  const src = art
    ? renderer.thumbnail(art.atlas, art.index)
    : renderer.thumbnail('expedition', p.kind === 'bridge' && p.restored ? 5 : (p.art ?? 8));
  return src
    ? `<img class="site-picture" src="${src}" alt="">`
    : '<span class="site-picture"></span>';
}
function renderPanel() {
  if (!sheet) return;
  if (sheet === 'inventory') {
    $('panel').innerHTML = `<div class="inventory-grid">${Object.keys(RES)
      .filter((k) => knownMaterial(s, k))
      .map(
        (k) =>
          `<article class="inventory-item">${materialIcon(k, renderer)}<b>${RES[k][1]}</b><strong>${Math.floor(s.resources[k]).toLocaleString('hu')}</strong></article>`,
      )
      .join(
        '',
      )}</div><p class="hint">A műhelyhez beadott anyagokat előre levonjuk. Az elkészült termék visszakerül ebbe a közös készletbe.</p>`;
    return;
  }
  if (sheet === 'supply') {
    const previousScroll = $('panel').scrollTop;
    const q = supplySummary(s),
      fmt = (n) => n.toLocaleString('hu', { maximumFractionDigits: 1 });
    const reserve =
      q.minutesLeft == null
        ? q.total
          ? 'A termelés fedezi a tervezett fogyasztást.'
          : 'Még nincs dolgozói fogyasztás.'
        : q.minutesLeft < 1
          ? 'A készlet kevesebb mint egy percnyi tervezett munkára elég.'
          : `A készlet kb. ${Math.floor(q.minutesLeft)} percre elég a jelenlegi tervezett terhelés mellett.`;
    $('panel').innerHTML =
      `<article class="quest-story"><b>Ellátottság: ${q.level}% · ${q.label}</b><p>${q.working} dolgozik · ${q.resting} pihen · ${q.waiting} várakozik</p><div class="supply-meter"><i style="width:${q.level}%"></i></div></article><div class="site-rows"><div><span>Élelemtermelés</span><b>${fmt(q.production)}/perc</b></div><div><span>Tervezett élelemfogyasztás</span><b>${fmt(q.demand)}/perc</b></div><div><span>Ellátás miatti munkatempó</span><b>${Math.round(supplyFactor(s) * 100)}%</b></div><div><span>Tervezett egyenleg</span><b>${q.net >= 0 ? '+' : ''}${fmt(q.net)}/perc</b></div></div><p>${escape(reserve)}</p><p class="hint">A fogyasztás teljes munkaterhelésre becsült. A munkások kb. 2 perc tényleges munka után maguktól esznek és pihennek. Teljes adag: 2 élelem, pihenő: 20 mp. Étel nélkül hosszabb a pihenő és lassabb a munka. Senki nem hal meg. A szigetet bezárva az egyéni energia nem csökken.</p><div class="site-list">${[...s.workers, ...Object.values(s.production?.crews || {})].map((w, i) => `<button data-worker="${escape(w.id)}"><span><b>${s.buildings.find((b) => b.id === w.buildingId)?.type === 'quarry' ? 'Bányász' : w.id.startsWith('artisan:') ? 'Műhelymester' : 'Favágó'} ${i + 1} · Energia: ${Math.round(w.energy)}%</b><small>${escape(w.recovery ? 'Étkezés / pihenés' : w.status || 'Munkára kész')}</small></span></button>`).join('')}</div>`;
    $('panel').scrollTop = previousScroll;
    document.querySelectorAll('[data-worker]').forEach(
      (button) =>
        (button.onclick = () => {
          selectedWorker = button.dataset.worker;
          closeSheet();
        }),
    );
    return;
  }
  if (sheet === 'sites') {
    const sites = s.adventure.sites
      .filter((p) => knownSite(s, p))
      .sort((a, b) => Number(!!siteReadiness(s, b)) - Number(!!siteReadiness(s, a)));
    $('panel').innerHTML =
      `<p class="hint">${s.resources.food < 2 && s.workers.length ? 'Kevés az élelem. A következő étkezésekhez utánpótlás kell.' : supplySummary(s).level < 70 ? 'Az ellátottság a sikeres étkezésekkel fokozatosan helyreáll.' : 'A megtalált helyszíneket vizsgálhatod meg, majd helyreállíthatod.'}</p><div class="site-list">${sites.map((p) => `<button data-site="${escape(p.id)}">${siteThumbnail(p)}<span><b>${escape(p.name)}</b><small>${siteReadiness(s, p) || (p.kind === 'forage' ? 'Gyűjtögethető' : p.restored ? 'Működik' : p.salvaged ? 'Átvizsgálva' : p.inspected ? 'Helyreállításra vár' : 'Megvizsgálható')}</small></span></button>`).join('')}</div>`;
    if (
      s.adventure.trader?.active &&
      s.revealed.includes(key(s.adventure.trader.x, s.adventure.trader.y))
    ) {
      const button = document.createElement('button');
      button.className = 'event-card';
      button.textContent = 'Vándorkereskedő · Ajánlatok és útbaigazítás';
      button.onclick = () => {
        closeSheet();
        approachEncounter('trader');
      };
      $('panel').append(button);
    }
    document.querySelectorAll('[data-site]').forEach(
      (b) =>
        (b.onclick = () => {
          closeSheet();
          selectSite(b.dataset.site);
        }),
    );
  } else {
    const e = eventView(s),
      orders = s.adventure.sites
        .filter((p) => p.inspected)
        .map((p) => activeOrder(s, p.id))
        .filter(Boolean);
    $('panel').innerHTML =
      `<article class="quest-story"><b>Következő lépés</b><p>${escape(objective(s))}</p></article>${orders.map((o) => `<article class="quest-story"><b>${escape(o.title)}</b><p>${escape(o.text)}</p>${materialAmounts(o.needs, renderer, { available: s.resources })}<small>Jutalom: ${materialAmounts(o.reward, renderer)}</small><p class="hint">Az anyagcsomagot a helyszínen adhatod át.</p></article>`).join('')}${e ? `<article class="quest-story"><b>${escape(e.title)}</b><p>${escape(e.text)}</p></article>` : ''}${s.chapter?.history[0] ? `<article class="quest-story remembered"><b>Elkészült: ${escape(s.chapter.history[0].title)}</b>${materialAmounts(s.chapter.history[0].reward, renderer)}</article>` : ''}${s.adventure.lastDiscovery ? `<article class="quest-story remembered"><b>${escape(s.adventure.lastDiscovery.title)} · Megtalálva</b><p>${escape(s.adventure.lastDiscovery.text)}</p></article>` : ''}<p class="hint">A nyomokhoz tartozó dolgokat a szigeten kell megtalálnod. A megrendelések nem járnak le.</p>`;
  }
}
function selectedSite() {
  return selected ? siteById(s, selected) : null;
}
function displayRate(b) {
  const r = RECIPES[TYPES[b.type].recipe];
  return r ? (60 / r.seconds) * craftSpeed(s, b) : buildingRate(s, b) * 60;
}
function detail() {
  const p = selectedSite();
  if (!p) {
    $('detail').hidden = true;
    return;
  }
  const b = p.buildingId ? s.buildings.find((b) => b.id === p.buildingId) : null,
    near = Math.hypot(s.hero.x - p.x, s.hero.y - p.y) <= 1.8;
  let note = '',
    action = '',
    label = '',
    rows = '',
    disabled = false;
  if (!near) {
    note = 'Menj közelebb, hogy megvizsgálhasd.';
    action = 'approach';
    label = 'Odamegyek';
  } else if (!p.inspected) {
    note = 'Minden helynek megvan a maga története.';
    action = 'inspect';
    label = 'Megvizsgálom';
  } else if (p.kind === 'forage' || p.kind === 'ore') {
    note =
      p.kind === 'ore'
        ? 'A kemény érből vasérc fejthető a kovácsműhelyhez.'
        : 'Kis adag élelem gyűjthető itt. Új adag 30 másodperc aktív játék után.';
    action = 'inspect';
    label =
      p.kind === 'ore' ? (p.oreLeft === 0 ? 'Kimerült lelőhely' : 'Vasércet fejtek') : 'Gyűjtök';
    disabled = p.kind === 'ore' && (p.oreLeft === 0 || !!s.hero.siteWork);
  } else if (p.kind === 'wreck' || p.kind === 'marker') {
    note = p.salvaged
      ? 'Ezt a helyet már megvizsgáltad.'
      : 'A régi nyomokat még érdemes közelebbről megnézni.';
    action = p.salvaged ? '' : 'inspect';
    label = 'Megvizsgálom';
  } else if (p.order && !p.restored) {
    const o = activeOrder(s, p.id);
    note = o ? o.text : 'Előbb a kapcsolódó műhelyt kell helyreállítanod.';
    if (o) {
      rows =
        materialAmounts(o.needs, renderer, { available: s.resources }) +
        `<p class="hint">Jutalom</p>` +
        materialAmounts(o.reward, renderer);
      action = 'order';
      label = 'Anyagcsomag átadása';
      disabled = !afford(s, o.needs);
    }
  } else if (!p.restored) {
    const check = restoration(s, p.id);
    note =
      (p.type === 'farm'
        ? 'Helyreállítva közvetlenül élelmet termel. '
        : p.type === 'hut'
          ? 'Kezdőbázis: közös készlet és találkozóhely. Nem termel. '
          : '') + check.reason;
    if (p.type && !['hut', 'tradepost', 'residence'].includes(p.type))
      rows = RECIPES[TYPES[p.type].recipe]
        ? `<p class=\"hint\">${TYPES[p.type].desc}. A helyreállítás után adhatod be a feldolgozandó adagot.</p>`
        : `<div><span>${RES[TYPES[p.type].output][1]}</span><b>${displayRate({ type: p.type, level: 1 }).toFixed(1)}/perc</b></div>`;
    rows += `<div class="material-row"><span>Szükséges · készlet / költség</span><b>${Object.keys(siteCost(s, p)).length ? materialAmounts(siteCost(s, p), renderer, { available: s.resources }) : 'Díjmentes rendbetétel'}</b></div>`;
    action = 'restore';
    label = p.type === 'hut' ? 'Rendbe teszem' : 'Helyreállítás';
    disabled = !check.ok;
  } else if (b) {
    const price = upgradeCost(b),
      next = { ...b, level: (b.level || 1) + 1 };
    if (b.type === 'hut') {
      note = 'Kezdőbázis · nem termel';
      rows =
        '<div><span>Szerepe</span><b>Közös készlet, találkozóhely</b></div><div><span>Kezdőkészlet</span><b>Átvéve · egyszeri készlet</b></div>';
    } else if (b.type === 'residence') {
      note = 'Az ács újra itt él és dolgozik. A kőfaragóműhely helyreállítható.';
      rows = '<p class="hint">Új szakember és új műhelymunka nyílt meg.</p>';
    } else if (b.type === 'tradepost') {
      note = 'Itt adhatod át az anyagcsomagokat, és ezüstből felszerelést vásárolhatsz.';
      rows = '';
    } else {
      const workers = s.workers.filter((w) => w.buildingId === b.id),
        rest = workers.filter((w) => w.recovery).length,
        active = workers.filter((w) =>
          ['outbound', 'working', 'returning', 'entering', 'emerging'].includes(w.phase),
        ).length;
      note = workers.length
        ? `${active} dolgozik · ${rest} pihen · ${workers.length - active - rest} várakozik`
        : RECIPES[TYPES[b.type].recipe]
          ? 'Beadott anyagból, adagokban dolgozik.'
          : 'Folyamatos termelés a közös készletbe.';
      const material = RES[TYPES[b.type].output][1];
      rows = price
        ? ''
        : `<div><span>${material}${workers.length ? ' (becsült)' : ''}</span><b>${displayRate(b).toFixed(1)}/perc</b></div>`;
      if (price) {
        rows += `<div><span>Következő fejlesztés</span><b>${b.level + 1}. szint</b></div><div><span>${material} · termelés</span><b>${displayRate(b).toFixed(1)} → ${displayRate(next).toFixed(1)}/perc</b></div>${workers.length ? `<div><span>Munkások</span><b>${workerCount(b)} → ${workerCount(next)}</b></div><div><span>Tervezett élelemigény</span><b>${workerCount(b)} → ${workerCount(next)}/perc</b></div>` : ''}<div class="material-row"><span>Szükséges · készlet / költség</span><b>${materialAmounts(price, renderer, { available: s.resources })}</b></div>`;
        action = 'upgrade';
        label = 'Fejlesztés';
        disabled = !afford(s, price);
      } else note += ' · Teljesen fejlesztve';
    }
  } else note = 'Az átjáró új lehetőséget nyitott.';
  if (near && p.restored && b && RECIPES[TYPES[b.type].recipe]) {
    const recipe = RECIPES[TYPES[b.type].recipe],
      jobs = (s.production?.jobs || []).filter((j) => j.buildingId === b.id);
    rows =
      `<div><span>Feldolgozás</span><b>${Math.round(recipe.seconds / craftSpeed(s, b))} mp/adag</b></div>` +
      materialAmounts(recipe.input, renderer) +
      `<span class="recipe-arrow">→</span>` +
      materialAmounts(recipe.output, renderer) +
      `<div class="craft-controls">${[1, 3, 6].map((n) => `<button data-craft="${n}" ${jobs.length + n > 12 || !afford(s, Object.fromEntries(Object.entries(recipe.input).map(([k, v]) => [k, v * n]))) ? 'disabled' : ''}>${n} adag</button>`).join('')}</div><p class="hint">${jobs.length ? `Sorban: ${jobs.length} adag · következő kb. ${Math.ceil(jobs[0].remaining / craftSpeed(s, b))} mp` : 'Csak a beállított adagot készíti el. Az alapanyagot indításkor adjuk át.'}</p>` +
      rows;
  }
  if (near && p.restored && p.id === 'tradepost') {
    const o = activeOrder(s, p.id);
    if (o) {
      rows += `<article class="quest-story"><b>${escape(o.title)}</b><p>${escape(o.text)}</p>${materialAmounts(o.needs, renderer, { available: s.resources })}<p>Jutalom: ${materialAmounts(o.reward, renderer)}</p><button id="deliverorder" ${afford(s, o.needs) ? '' : 'disabled'}>Anyagcsomag átadása</button></article>`;
    }
    rows += Object.entries(SHOP)
      .map(
        ([id, o]) =>
          `<article class="quest-story"><b>${escape(o.label)}</b><p>${escape(o.text)}</p>${materialAmounts(o.cost, renderer)}<button data-equipment="${id}" ${s.chapter.perks[o.perk] || !afford(s, o.cost) ? 'disabled' : ''}>${s.chapter.perks[o.perk] ? 'Megvásárolva' : 'Megvásárolom'}</button></article>`,
      )
      .join('');
  }
  $('detail').hidden = false;
  $('detail').innerHTML =
    `<div class="site-head"><div><h3>${escape(p.name)}${b ? ' · ' + b.level + '. szint' : ''}</h3><p>${escape(note)}</p></div><button id="dismissdetail" aria-label="Panel bezárása">✕</button></div><div class="site-rows">${rows}</div>${action ? `<div class="site-actions"><button id="siteaction" ${disabled ? 'disabled' : ''}>${label}</button></div>` : ''}`;
  $('dismissdetail').onclick = () => {
    selected = null;
    detail();
  };
  document.querySelectorAll('[data-craft]').forEach(
    (button) =>
      (button.onclick = () => {
        settle();
        if (queueCraft(s, b.id, Number(button.dataset.craft))) {
          save();
          render(true);
          toast('Az alapanyag a műhelybe került. A kész adagok a hátizsákba kerülnek.');
        }
      }),
  );
  if ($('deliverorder')) $('deliverorder').onclick = () => finishOrder(p);
  document.querySelectorAll('[data-equipment]').forEach(
    (button) =>
      (button.onclick = () => {
        if (buyEquipment(s, button.dataset.equipment)) {
          save();
          render(true);
          toast('A műhelyfelszerelés használatba került.');
        }
      }),
  );
  if (action)
    $('siteaction').onclick = () => {
      if (action === 'approach') approachSite(p);
      if (action === 'inspect') inspect(p);
      if (action === 'restore') {
        settle();
        if (restoreSite(s, p.id)) {
          syncWorkers(s);
          save();
          toast(
            p.kind === 'bridge'
              ? 'Az átjáró elkészült. A túlpart megnyílt.'
              : 'A hely újra életre kelt.',
          );
          maybeEvent(s);
        }
        render(true);
      }
      if (action === 'order') finishOrder(p);
      if (action === 'upgrade') {
        settle();
        if (upgrade(s, b.id)) {
          syncWorkers(s);
          save();
          toast('A fejlesztés elkészült.');
        }
        render(true);
      }
    };
}
function finishOrder(p) {
  const order = activeOrder(s, p.id);
  if (order && deliverOrder(s, p.id, order.id)) {
    syncWorkers(s);
    save();
    render(true);
    toast('Az anyagcsomagot átadtad. A munka elkészült, az ezüst a hátizsákba került.');
  }
}
let detailSignature = '';
function render(force = false) {
  $('resources').innerHTML = Object.entries(RES)
    .filter(([k]) => ['wood', 'stone', 'food', 'gold'].includes(k))
    .map(
      ([k, [icon, name]]) =>
        `<div class="resource ${k === 'food' && s.resources.food <= 0 ? 'low' : ''}" aria-label="${name}" title="${name}${k === 'food' ? ' · A munkások ellátása és fejlesztések' : ''}"><span class="ico">${icon}</span><b>${Intl.NumberFormat('hu', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.floor(s.resources[k]))}</b></div>`,
    )
    .join('');
  $('nextgoal').textContent = objective(s);
  $('backpack').innerHTML = materialIcon('backpack', renderer);
  const ready = readySites(s).length;
  $('readycount').textContent = ready || '';
  $('readycount').hidden = !ready;
  const q = supplySummary(s),
    supply = $('supply');
  supply.textContent = `Ellátottság ${q.level}% · ${q.working} dolgozik`;
  supply.dataset.level = q.level >= 70 ? 'good' : q.level >= 35 ? 'low' : 'poor';
  supply.setAttribute(
    'aria-label',
    `Munka és ellátás. Ellátottság ${q.level} százalék. ${q.working} dolgozik, ${q.resting} pihen.`,
  );
  supply.classList.toggle(
    'shortage',
    q.total > 0 && (s.resources.food < 2 || (q.minutesLeft != null && q.minutesLeft < 3)),
  );
  $('questdot').textContent = s.adventure.pending ? '•' : '';
  const p = selectedSite(),
    b = p?.buildingId ? s.buildings.find((v) => v.id === p.buildingId) : null;
  const signature = JSON.stringify([
    selected,
    JSON.stringify(s.resources),
    s.production?.jobs.map((j) => j.id + ':' + Math.ceil(j.remaining)).join(','),
    q.working,
    q.resting,
    q.waiting,
    p?.inspected,
    p?.restored,
    p?.salvaged,
    b?.level,
    b && afford(s, upgradeCost(b) || {}),
    p?.cost && afford(s, siteCost(s, p)),
    s.adventure.items['repair-kit'] || 0,
    p && Math.hypot(s.hero.x - p.x, s.hero.y - p.y) <= 1.8,
  ]);
  if (force || signature !== detailSignature) {
    detail();
    detailSignature = signature;
  }
  if (force || sheet === 'supply' || sheet === 'inventory') renderPanel();
}
function inspect(p) {
  if (!p) return;
  if (p.kind === 'ore') {
    if (p.oreLeft === 0) {
      toast('Ez a lelőhely kimerült.');
      return;
    }
    if (!s.hero.siteWork) {
      s.hero.siteWork = { siteId: p.id, remaining: 1.2, elapsed: 0 };
      save();
    }
    return;
  }
  const r = inspectSite(s, p.id);
  if (r.ok) {
    save();
    render(true);
    if (!openBaseWelcome()) toast(r.text);
  } else approachSite(p);
}
function selectSite(id) {
  encounterTarget = null;
  selectedWorker = null;
  selected = id;
  const p = selectedSite();
  if (p && !p.inspected) approachSite(p);
  else detail();
}
function approachSite(p) {
  const path = smoothPath(s, s.hero, findPath(s, s.hero, { x: p.x, y: p.y }));
  if (!path) {
    toast('Innen nincs járható út. Keress egy másik ösvényt.');
    return;
  }
  delete s.hero.job;
  delete s.hero.siteWork;
  drive = { x: 0, y: 0 };
  route = path;
  siteTarget = p.id;
  camera.follow = true;
  if (!path.length) {
    siteTarget = null;
    inspect(p);
  }
  detail();
}
function nodeFor(id) {
  const [, x, y] = id.split(':');
  return resourceTarget(s, Number(x), Number(y), id);
}
function gather(node) {
  delete s.hero.siteWork;
  encounterTarget = null;
  selectedWorker = null;
  if (!node) return;
  siteTarget = null;
  selected = null;
  if (s.hero.job?.targetId === node.id) {
    queueGather(s, node);
    return;
  }
  const path = resourcePath(s, s.hero, node);
  if (!path) {
    toast('A nyersanyagot innen nem éred el.');
    return;
  }
  queueGather(s, node);
  route = path;
  camera.follow = true;
  save();
  detail();
}
function update(dt) {
  if (!ready || document.hidden) return;
  updateWorkers(s, dt);
  const paused = $('storymodal').open || $('modal').open;
  s.hero.action = 'idle';
  if (!paused) {
    s.adventure.playTime += dt;
    if (Math.hypot(drive.x, drive.y) > 0.04) {
      route = [];
      siteTarget = null;
      encounterTarget = null;
      delete s.hero.job;
      delete s.hero.siteWork;
      if (driveHero(s, drive, dt)) s.hero.action = 'run';
      camera.follow = true;
    } else if (route.length) {
      advanceHero(s, route, dt, 1.7);
      s.hero.action = 'run';
    } else if (s.hero.siteWork) {
      const work = s.hero.siteWork,
        p = siteById(s, work.siteId);
      if (!p || Math.hypot(s.hero.x - p.x, s.hero.y - p.y) > 1.8) delete s.hero.siteWork;
      else {
        work.elapsed += dt;
        work.remaining -= dt;
        s.hero.action = 'mine';
        s.hero.workTime = work.elapsed;
        s.hero.targetAngle = Math.atan2(-(p.x - s.hero.x), p.y - s.hero.y);
        if (work.remaining <= 0) {
          delete s.hero.siteWork;
          const result = inspectSite(s, p.id);
          save();
          render(true);
          toast(result.text);
        }
      }
    } else if (s.hero.job) {
      const j = s.hero.job,
        node = nodeFor(j.targetId);
      if (!node) {
        delete s.hero.job;
      } else if (Math.hypot(s.hero.x - node.x, s.hero.y - node.y) > 1.3) {
        const path = resourcePath(s, s.hero, node);
        if (path) route = path;
        else delete s.hero.job;
      } else {
        const result = advanceGathering(s, dt);
        s.hero.action = result.finished ? 'idle' : node.kind === 'wood' ? 'chop' : 'mine';
        s.hero.workTime = result.clock || 0;
        s.hero.targetAngle = Math.atan2(-(node.x - s.hero.x), node.y - s.hero.y);
        if (result.impacts) {
          save();
          render();
        }
      }
    }
    if (!route.length && encounterTarget) {
      const target = encounterTarget;
      encounterTarget = null;
      finishEncounter(target);
    }
    if (!route.length && siteTarget) {
      const id = siteTarget;
      siteTarget = null;
      selected = id;
      inspect(siteById(s, id));
    }
  }
  const desired = Number.isFinite(s.hero.targetAngle) ? s.hero.targetAngle : 0,
    current = Number.isFinite(s.hero.angle) ? s.hero.angle : desired;
  s.hero.angle =
    current +
    Math.atan2(Math.sin(desired - current), Math.cos(desired - current)) * (1 - Math.exp(-dt * 16));
  const cell = key(Math.round(s.hero.x), Math.round(s.hero.y));
  if (cell !== lastCell) {
    lastCell = cell;
    const found = revealAround(s, s.hero, s.worldVersion >= 2 ? 2.5 : 2.8);
    const sites = discoverSites(s);
    sites.forEach((p) => toast('Új helyszínt találtál: ' + p.name));
    if (found) {
      maybeEvent(s);
      save();
      render();
    }
  }
  if (camera.follow) {
    const a = 1 - Math.exp(-dt * 7);
    camera.focus.x += (s.hero.x - camera.focus.x) * a;
    camera.focus.y += (s.hero.y - camera.focus.y) * a;
    camera.x *= 1 - a;
    camera.y *= 1 - a;
  }
  lastUI += dt;
  if (lastUI > 0.5) {
    lastUI = 0;
    render();
  }
}
const canvas = $('map'),
  renderer = createRenderer(
    canvas,
    () => s,
    () => {
      const p = selectedSite();
      return p ? { x: p.x, y: p.y } : null;
    },
    camera,
    {
      update,
      destination: () => route.at(-1),
      selectedWorker: () => selectedWorker,
      harvestTarget: () => {
        const n = s.hero.job && nodeFor(s.hero.job.targetId);
        return n ? { x: n.tileX, y: n.tileY, resourceId: n.id } : null;
      },
      onReady: () => {
        ready = true;
        $('loading').hidden = true;
        discoverSites(s);
        if (s.hero.job) {
          const n = nodeFor(s.hero.job.targetId);
          if (n) route = resourcePath(s, s.hero, n) || [];
        }
        if (!s.adventure.introSeen || !s.adventure.tutorialSeen) openIntro();
        else openBaseWelcome();
      },
      onError: (e) => {
        const box = $('loading');
        const title = document.createElement('strong');
        title.textContent = 'A grafika betöltése megállt';
        const reason = document.createElement('p');
        reason.textContent = e.message;
        const retry = document.createElement('button');
        retry.textContent = 'Újrapróbálom';
        retry.onclick = () => location.reload();
        const settings = document.createElement('button');
        settings.textContent = 'Mentés és frissítés';
        settings.onclick = () => $('settings').click();
        box.replaceChildren(title, reason, retry, settings);
        box.style.zIndex = '3';
      },
    },
  );
attachGestures(canvas, camera, {
  change: () => {
    camera.follow = false;
  },
  steer: (v) => {
    drive = v;
    if (Math.hypot(v.x, v.y) > 0.04) {
      closeSheet();
      selected = null;
      detail();
    }
  },
  stick: (p) => {
    $('joystick').hidden = !p;
    if (p) {
      $('joystick').style.left = p.x + 'px';
      $('joystick').style.top = p.y + 'px';
      $('stickknob').style.transform = `translate(${p.dx}px,${p.dy}px)`;
    }
  },
  tap: (p) => {
    if (!ready) return;
    if (sheet) {
      closeSheet();
      return;
    }
    const hit = renderer.hit(p);
    if (!hit) return;
    if (hit.workerId) {
      selectedWorker = hit.workerId;
      return;
    }
    selectedWorker = null;
    if (hit.discovery || hit.event) {
      approachEncounter(hit.discovery ? 'event' : 'trader');
      return;
    }
    let site = hit.siteId
      ? siteById(s, hit.siteId)
      : s.adventure.sites.find((v) => v.x === hit.x && v.y === hit.y);
    if (site && knownSite(s, site)) {
      selectSite(site.id);
      return;
    }
    const node = resourceTarget(s, hit.x, hit.y, hit.resourceId);
    if (node && s.revealed.includes(key(hit.x, hit.y))) gather(node);
    else {
      selected = null;
      detail();
    }
  },
});
function dialog(title, text, buttons) {
  drive = { x: 0, y: 0 };
  $('storytitle').textContent = title;
  $('storytext').textContent = text;
  $('storyactions').replaceChildren();
  $('storyextras').replaceChildren();
  for (const action of buttons) {
    const b = document.createElement('button');
    b.textContent = action.label;
    if (action.cost) {
      const amount = document.createElement('span');
      amount.innerHTML = materialAmounts(action.cost, renderer);
      b.append(amount);
    }
    b.disabled = !!action.disabled;
    b.onclick = action.run;
    $('storyactions').append(b);
  }
  if (!$('storymodal').open) $('storymodal').showModal();
}
function openBaseWelcome() {
  const found = pendingBaseWelcome(s);
  if (!found) return false;
  dialog(
    'Egy hely, ahonnan elindulhatsz',
    'A ház régóta üresen áll, de a tető még tart. Odabent félretett faanyagot, követ és egy kis élelemtartalékot találsz. Rendbe hozva ez lehet a bázisod, ahonnan felfedezheted a szigetet.',
    [
      {
        label: 'Rendbe hozom a házat',
        run: () => {
          acknowledgeBaseWelcome(s, found.siteId);
          save();
          $('storymodal').close();
          closeSheet();
          selected = found.siteId;
          selectedWorker = null;
          detail();
        },
      },
    ],
  );
  const caption = document.createElement('p');
  caption.className = 'base-reward-caption';
  caption.textContent = 'A közös készletbe került:';
  const list = document.createElement('div');
  list.className = 'base-rewards';
  for (const [kind, amount] of Object.entries(found.reward)) {
    const cell = document.createElement('div');
    cell.className = 'resource';
    cell.setAttribute('aria-label', `${RES[kind][1]}: ${amount}`);
    const icon = document.createElement('img');
    icon.className = 'material-icon';
    icon.src = iconSource(kind, renderer);
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'base-reward-label';
    label.textContent = RES[kind][1];
    const count = document.createElement('b');
    count.textContent = '+' + amount;
    cell.append(icon, count, label);
    list.append(cell);
  }
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = 'Ez egyszeri indulókészlet. A bázis nem termel.';
  $('storyextras').append(caption, list, note);
  return true;
}
function showHelp() {
  dialog(
    'Így működik a sziget',
    'Húzd és tartsd az ujjad a világon: a karakter fut. Két ujjal mozgatod és nagyítod a kamerát.\n\nA készleteket a hátizsákban látod, a fejleszthető épületeket nyíl jelzi. Koppints egy látható tárgyra vagy helyszínre: a karakter odamegy és megvizsgálja. A feladatok csak nyomot adnak, a megoldást neked kell megtalálnod.\n\nA bázis egyszeri készletet ad, utána nem termel. A gazdaság közvetlenül élelmet biztosít. A dolgozók maguktól esznek és pihennek. A kezdőkészlet véges; az ellátottságjelzőnél láthatod a fogyasztást és az energiaállapotokat.',
    [
      {
        label: 'Értem',
        run: () => {
          s.adventure.tutorialSeen = true;
          save();
          $('storymodal').close();
          openBaseWelcome();
        },
      },
    ],
  );
}
function openIntro() {
  if (s.adventure.introSeen) {
    showHelp();
    return;
  }
  if (s.adventure.kind === 'legacy') {
    dialog(
      'A szigeted megmaradt',
      'A korábbi városod, készleteid és fejlesztéseid érintetlenek. Az új, hajótöréssel induló kaland külön szigeten is elkezdhető. A két állás között később visszaválthatsz.',
      [
        {
          label: 'Folytatom a meglévő szigeten',
          run: () => {
            s.adventure.introSeen = true;
            save();
            $('storymodal').close();
            showHelp();
          },
        },
        {
          label: 'Új kaland, a régi város megőrzésével',
          run: () => {
            activate(switchCampaign(s));
            $('storymodal').close();
            openIntro();
          },
        },
      ],
    );
    return;
  }
  dialog(
    'Ismeretlen part',
    'Egy vihar elsodorta a hajódat. Egy ismeretlen parton térsz magadhoz, a sziget belsejét köd takarja. A part mentén régi ösvény vezet az erdőbe.',
    [
      {
        label: 'Felállok',
        run: () => {
          s.adventure.introSeen = true;
          save();
          $('storymodal').close();
          showHelp();
        },
      },
    ],
  );
}
function approachEncounter(kind) {
  const target = kind === 'event' ? s.adventure.pending?.target : s.adventure.trader;
  if (!target) return;
  if (Math.hypot(s.hero.x - target.x, s.hero.y - target.y) <= 1.6) {
    finishEncounter(kind);
    return;
  }
  const approaches = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
    .map(([x, y]) => ({ x: target.x + x, y: target.y + y }))
    .filter((p) => walkable(s, p.x, p.y))
    .sort(
      (p, q) =>
        Math.hypot(p.x - s.hero.x, p.y - s.hero.y) - Math.hypot(q.x - s.hero.x, q.y - s.hero.y),
    );
  let raw = null;
  for (const point of approaches) {
    raw = findPath(s, s.hero, point);
    if (raw) break;
  }
  if (!raw) {
    toast('Keress egy járható ösvényt a helyszínhez.');
    return;
  }
  route = smoothPath(s, s.hero, raw);
  encounterTarget = kind;
  siteTarget = null;
  selected = null;
  delete s.hero.job;
  camera.follow = true;
  detail();
}
function finishEncounter(kind) {
  if (kind === 'trader' && s.adventure.pending?.type !== 'visitor') {
    openTrader();
    return;
  }
  const result = inspectDiscovery(s);
  if (result.ok) {
    save();
    render(true);
    toast(result.text);
    if (s.adventure.trader?.active && kind === 'trader') openTrader();
  } else toast(result.text);
}
function openTrader() {
  if (s.chapter) {
    const post = s.adventure.sites.find((p) => p.id === 'tradepost');
    if (post) {
      selected = post.id;
      closeSheet();
      if (Math.hypot(s.hero.x - post.x, s.hero.y - post.y) > 1.8) approachSite(post);
      else detail();
    }
    return;
  }
  const t = s.adventure.trader;
  if (!t || Math.hypot(s.hero.x - t.x, s.hero.y - t.y) > 1.8) {
    toast('Az utazóval a helyszínen tudsz kereskedni.');
    return;
  }
  t.stock ??= 2;
  dialog(
    'Vándorkereskedő',
    t.stock
      ? 'Az utazó nem siet el. A megmaradt ajánlatai később is elérhetők.'
      : 'A csomagjai most üresek, de az útbaigazítása megmarad.',
    [
      ...traderOffers(s).map((o) => ({
        label: o.text + (o.used ? ' · Elfogyott' : ''),
        disabled: o.used || !t.stock || !afford(s, o.cost),
        run: () => {
          if (trade(s, o.id)) {
            save();
            render();
            openTrader();
            if (o.item) toast('A javítókészlet a következő helyreállítás költségét csökkenti.');
          }
        },
      })),
      { label: 'Vissza a szigetre', run: () => $('storymodal').close() },
    ],
  );
}
function activate(next) {
  toastQueue.length = 0;
  currentToast = '';
  clearTimeout(toastTimer);
  $('toast').classList.remove('show');
  s = next;
  drive = { x: 0, y: 0 };
  route = [];
  siteTarget = null;
  selected = null;
  selectedWorker = null;
  encounterTarget = null;
  lastCell = '';
  camera.focus = { x: s.hero.x, y: s.hero.y };
  camera.x = camera.y = 0;
  camera.follow = true;
  closeSheet();
  const caught = tick(s, Date.now(), false);
  produceOfflineWorkers(s, caught);
  save();
  render(true);
}
$('settings').onclick = () => {
  drive = { x: 0, y: 0 };
  $('saveinfo').textContent =
    `Játékverzió: 0.10 · Mentés: v${s.version}. ${s.archive ? 'A megőrzött szigeteid ugyanebben a mentésben vannak.' : 'Automatikus mentés ezen az eszközön.'}`;
  $('switchcampaign').textContent = s.archive
    ? 'Váltás a másik megőrzött szigetre'
    : 'Új kaland, a jelenlegi sziget megőrzésével';
  $('backup').hidden = !migrationBackup();
  $('savedislands').innerHTML = [...(s.archive ? [s.archive] : []), ...(s.otherIslands || [])]
    .map(
      (v, i) =>
        `<button data-island="${i}">Megőrzött sziget ${i + 1} · ${v.buildings.length} épület</button>`,
    )
    .join('');
  document.querySelectorAll('[data-island]').forEach(
    (button) =>
      (button.onclick = () => {
        settle();
        activate(switchCampaign(s, Number(button.dataset.island)));
        $('modal').close();
        if (!s.adventure.introSeen || !s.adventure.tutorialSeen) openIntro();
        else openBaseWelcome();
      }),
  );
  $('modal').showModal();
};
$('freshchapter').onclick = () => {
  settle();
  activate(startFreshAdventure(s));
  $('modal').close();
  openIntro();
};
$('backpack').onclick = () => openSheet('inventory');
$('close').onclick = () => $('modal').close();
$('switchcampaign').onclick = () => {
  settle();
  activate(switchCampaign(s));
  $('modal').close();
  if (!s.adventure.introSeen || !s.adventure.tutorialSeen) openIntro();
  else openBaseWelcome();
};
function download(data, name) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function migrationBackup() {
  return (
    localStorage.getItem('szigetkert.backup.pre-chapter-v6') ||
    localStorage.getItem('szigetkert.backup.pre-supply-v5')
  );
}
$('backup').onclick = () => {
  try {
    const raw = migrationBackup();
    if (raw) download(JSON.parse(raw), 'szigetkert-atalakitas-elotti-mentes.json');
  } catch {
    toast('A korábbi mentés most nem olvasható.');
  }
};
$('export').onclick = () => {
  settle();
  download(s, `szigetkaland-${new Date().toISOString().slice(0, 10)}.json`);
};
$('import').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 8000000) throw Error('Túl nagy mentés.');
    const candidate = importGame(await f.text());
    if (!confirm('Az import lecseréli az aktív mentést. Előtte exportáld a jelenlegit. Folytatod?'))
      return;
    saveOK = true;
    activate(candidate);
    $('modal').close();
    if (!s.adventure.introSeen || !s.adventure.tutorialSeen) openIntro();
    else openBaseWelcome();
    toast('A szigeted betöltődött.');
  } catch (e) {
    toast(e.message);
  } finally {
    $('import').value = '';
  }
};
$('supply').onclick = () => openSheet('supply');
$('help').onclick = () => {
  $('modal').close();
  showHelp();
};
$('nextgoal').onclick = () => openSheet('quests');
$('closesheet').onclick = closeSheet;
document
  .querySelectorAll('[data-tab]')
  .forEach((b) => (b.onclick = () => openSheet(b.dataset.tab)));
const keys = new Set();
function keyDrive() {
  drive = {
    x:
      Number(keys.has('d') || keys.has('ArrowRight')) -
      Number(keys.has('a') || keys.has('ArrowLeft')),
    y:
      Number(keys.has('s') || keys.has('ArrowDown')) - Number(keys.has('w') || keys.has('ArrowUp')),
  };
}
window.addEventListener('keydown', (e) => {
  if ($('modal').open || $('storymodal').open) return;
  if (['w', 'a', 's', 'd', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    keys.add(e.key);
    keyDrive();
  }
  if (e.key === 'Escape') {
    closeSheet();
    selected = null;
    detail();
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.key);
  keyDrive();
});
window.addEventListener('blur', () => {
  keys.clear();
  drive = { x: 0, y: 0 };
});
document.addEventListener('visibilitychange', () => {
  settle();
  previouslyHidden = document.hidden;
  drive = { x: 0, y: 0 };
  save();
  render();
});
window.addEventListener('pagehide', () => {
  settle();
  save();
});
setInterval(() => {
  if (document.hidden) return;
  settle();
  save();
  render();
}, 2000);
if (loaded.error)
  toast('A korábbi mentés nem olvasható. Nem írjuk felül; importálj biztonsági másolatot.');
render(true);
setupOffline({ save, toast });
