import { voyagePanel, applyVoyageAction } from './voyage-ui.js';
import { voyageSite, inspectVoyageSite, readVoyageDiary, projectDone } from './voyage.js';
import { beginSailing, advanceSailing, settleAway, awayEconomy } from './island-travel.js';
import { carpenterSpeech } from './story-text.js';
import {
  noticeEligible,
  needsNotice,
  nearbyNotices,
  acknowledgeSiteNotice,
  siteNotice,
} from './site-notices.js';
import { patchMarkup } from './dom-patch.js';
import { RECIPES } from './content.js';
import {
  queueCraft,
  craftSpeed,
  craftLimit,
  productionProgress,
  craftEstimate,
  durationText,
} from './production.js';
import {
  activeOrder,
  deliverOrder,
  knownMaterial,
  ensureMerchant,
  carpenterWaiting,
  introduceCarpenter,
  currentTask,
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
  canUpgradeBuilding,
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
  WRECK_SUPPLIES,
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
settleAway(s, Date.now());
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
  zoom: s.worldVersion === 5 ? 0.98 : 1.08,
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
  toastTimer = setTimeout(nextToast, 5000);
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
  settleAway(s, Date.now());
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
      )}</div>${s.voyage?.diaryRead ? `<section class="voyage-project"><h4>Megőrzött tárgyak</h4><p>Elázott hajónapló${s.voyage.riggingOwned && !projectDone(s, 'boat-rigging') ? ' · Vitorlavászon és kötélzet' : ''}${s.voyage.beaconLit ? ' · A napló megkerült lapja' : ''}</p></section>` : ''}<p class="hint">A hátizsák a szigeten összegyűjtött, szabadon felhasználható anyagaidat mutatja.${s.production?.jobs.length ? ' A műhelynek beadott alapanyag már nincs itt; a késztermék automatikusan ide kerül.' : ''}</p>`;
    return;
  }
  if (sheet === 'supply') {
    const previousScroll = $('panel').scrollTop;
    const q = supplySummary(awayEconomy(s)),
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
  if (sheet === 'quests') {
    const task = currentTask(s);
    $('panel').innerHTML =
      `<article class="quest-story current-task"><b>${escape(task.title)}</b><p>${escape(task.text)}</p>${task.needs ? materialAmounts(task.needs, renderer, { available: s.resources }) : ''}${task.benefit ? `<p class="task-result">${escape(task.benefit)}</p>` : ''}</article>`;
  }
}

function selectedSite() {
  return selected ? siteById(s, selected) : null;
}
function displayRate(b) {
  const r = RECIPES[TYPES[b.type].recipe];
  return r ? (60 / r.seconds) * craftSpeed(s, b) : buildingRate(s, b) * 60;
}
let craftChoice = { buildingId: null, units: 0 },
  craftDragging = false;
let detailOwner = null;
function detail() {
  if (craftDragging || document.activeElement?.id === 'craftamount') return;
  const p = selectedSite();
  if (!p || $('storymodal').open || needsNotice(s, p)) {
    $('detail').hidden = true;
    detailOwner = null;
    return;
  }
  const special = voyagePanel(s, p, renderer);
  if (special) {
    renderVoyageDetail(p, special);
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
    note = o
      ? o.text
      : carpenterWaiting(s)
        ? 'Az ajtón hagyott üzenet szerint az ács a bázisodnál keres. Előbb beszélj vele.'
        : !s.buildings.some((b) => b.type === 'sawmill')
          ? 'Előbb keresd meg és indítsd el a régi fűrészműhelyt. Ott elkészítheted az ácsnak kért deszkát.'
          : 'Beszélj az áccsal a bázisnál, hogy megbeszéljétek a tető javítását.';
    if (o) {
      rows =
        materialAmounts(o.needs, renderer, { available: s.resources }) +
        `<p class="hint">${escape(o.benefit || 'Az anyagért fizet:')}</p>` +
        materialAmounts(o.reward, renderer);
      action = 'order';
      label = 'Anyagcsomag átadása';
      disabled = !afford(s, o.needs);
    }
  } else if (!p.restored) {
    const check = restoration(s, p.id);
    note =
      (p.type === 'farm'
        ? 'Helyreállítva élelmet termel. A munkások ebből esznek pihenéskor: visszanyerik az energiájukat, és gyorsabban dolgoznak. '
        : p.type === 'hut'
          ? 'Kezdőbázis: közös készlet és találkozóhely. Nem termel. '
          : '') + check.reason;
    if (p.type && !['hut', 'tradepost', 'residence'].includes(p.type))
      rows = RECIPES[TYPES[p.type].recipe]
        ? `<p class=\"hint\">${TYPES[p.type].desc}. A helyreállítás után adhatod be a feldolgozandó mennyiséget.</p>`
        : `<div><span>${RES[TYPES[p.type].output][1]}</span><b>${displayRate({ type: p.type, level: 1 }).toFixed(1)}/perc</b></div>`;
    rows += `<div class="material-row"><span>Szükséges · készlet / költség</span><b>${Object.keys(siteCost(s, p)).length ? materialAmounts(siteCost(s, p), renderer, { available: s.resources }) : 'Díjmentes rendbetétel'}</b></div>`;
    action = 'restore';
    label = p.type === 'hut' ? 'Rendbe teszem' : 'Helyreállítás';
    disabled = !check.ok;
  } else if (b) {
    const price = upgradeCost(b),
      next = { ...b, level: (b.level || 1) + 1 };
    if (b.type === 'hut') {
      note = carpenterWaiting(s) ? 'Egy ács vár rád a háznál.' : 'Kezdőbázis · nem termel';
      rows =
        '<div><span>Szerepe</span><b>Közös készlet, találkozóhely</b></div><div><span>Kezdőkészlet</span><b>Átvéve · egyszeri készlet</b></div>';
      if (carpenterWaiting(s)) {
        action = 'carpenter';
        label = 'Beszélek az áccsal';
      }
    } else if (b.type === 'residence') {
      note =
        'Az ács itt lakik, és a fűrészműhelyben dolgozik. A további bővítéseknél is ő végzi a szakmunkát.';
      rows = `<div><span>Munkahelye</span><b>Fűrészműhely · ${s.buildings.find((v) => v.type === 'sawmill')?.level || 1}. szint</b></div><p class="hint">A jobb munkapadot és vezetősínt ő készítette. A következő műhelybővítés anyagigényét és munkadíját a fűrészműhelynél látod.</p>`;
    } else if (b.type === 'tradepost') {
      note =
        'Az udvar mellett álló kereskedőnek itt adhatod el a javításaihoz kért anyagokat. Az árat előre látod.';
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
          ? 'Megadott mennyiségű alapanyagot dolgoz fel.'
          : 'Folyamatos termelés a közös készletbe.';
      const material = RES[TYPES[b.type].output][1];
      rows = price
        ? ''
        : `<div><span>${material}${workers.length ? ' (becsült)' : ''}</span><b>${displayRate(b).toFixed(1)}/perc</b></div>`;
      if (!canUpgradeBuilding(s, b)) {
        note =
          'Működik 1. szinten, kézi fűrészeléssel. Az ács jobb munkapadot és vezetősínt készíthet: ettől lesz gyorsabb a 2. szint.';
        rows = '';
      } else if (price) {
        rows += `<div><span>Következő fejlesztés</span><b>${b.level + 1}. szint</b></div><div><span>${material} · termelés</span><b>${displayRate(b).toFixed(1)} → ${displayRate(next).toFixed(1)}/perc</b></div>${workers.length ? `<div><span>Munkások</span><b>${workerCount(b)} → ${workerCount(next)}</b></div><div><span>Tervezett élelemigény</span><b>${workerCount(b)} → ${workerCount(next)}/perc</b></div>` : ''}<div class="material-row"><span>Szükséges · készlet / költség</span><b>${materialAmounts(price, renderer, { available: s.resources })}</b></div>`;
        action = 'upgrade';
        label = 'Fejlesztés';
        disabled = !afford(s, price) || !canUpgradeBuilding(s, b);
        if (!canUpgradeBuilding(s, b))
          note =
            'Működik 1. szinten, kézi fűrészeléssel. Az ács jobb munkapadot és vezetősínt készíthet: ettől lesz gyorsabb a 2. szint.';
        if (price.silver)
          rows += '<p class="hint">Az ezüst a műhely bővítésén dolgozó mester munkadíja.</p>';
      } else note += ' · Teljesen fejlesztve';
    }
  } else note = 'Az átjáró új lehetőséget nyitott.';
  if (near && p.restored && b && RECIPES[TYPES[b.type].recipe]) {
    const recipe = RECIPES[TYPES[b.type].recipe],
      max = craftLimit(s, recipe),
      progress = productionProgress(s, b);
    if (craftChoice.buildingId !== b.id) craftChoice = { buildingId: b.id, units: 0 };
    craftChoice.units = Math.min(craftChoice.units, max);
    const inventory = Object.fromEntries(
      Object.keys(recipe.input).map((k) => [k, Math.floor(s.resources[k])]),
    );
    rows =
      `<section class="craft-planner"><b>Mit készít a műhely?</b><div class="recipe-line">${materialAmounts(recipe.input, renderer)}<span>→</span>${materialAmounts(recipe.output, renderer)}</div><p class="hint">${b.type === 'sawmill' ? 'A deszka tetőkhöz és a műhelyek javításához kell.' : b.type === 'mason' ? 'A faragott kő tartós falakhoz és a raktár javításához kell.' : TYPES[b.type].desc + '.'}</p><label for="craftamount">Mennyit szeretnél készíteni?</label><p class="craft-stock">Készleted: ${materialAmounts(inventory, renderer)}</p><input id="craftamount" type="range" min="0" max="${max}" step="1" value="${craftChoice.units}" aria-label="Készítendő mennyiség"><div id="craftpreview" class="recipe-line" aria-live="polite"></div><p id="crafttime" class="craft-time" aria-live="polite"></p><button id="startcraft">Gyártás indítása</button>${!max ? '<p class="hint">Még nincs elég alapanyag egy késztermékhez. Nem vontunk le semmit.</p>' : ''}${progress ? `<div class="work-status"><b>Folyamatban: ${progress.completed} / ${progress.total} ${RES[progress.outputKind][1].toLowerCase()} kész</b><progress value="${progress.fraction}" max="1"></progress><p>Feldolgozásra vár: ${materialAmounts(progress.inputLeft, renderer)} → ${materialAmounts(progress.outputLeft, renderer)}</p></div>` : ''}</section>` +
      rows;
  }
  if (near && p.restored && p.id === 'tradepost') {
    const o = activeOrder(s, p.id);
    if (o) {
      rows += `<article class="quest-story"><b>${escape(o.title)}</b><p>${escape(o.text)}</p>${materialAmounts(o.needs, renderer, { available: s.resources })}<p>Jutalom: ${materialAmounts(o.reward, renderer)}</p><button id="deliverorder" ${afford(s, o.needs) ? '' : 'disabled'}>Anyagcsomag átadása</button></article>`;
    }
  }
  $('detail').hidden = false;
  const keepDetailScroll = detailOwner === selected;
  const previousScroll = $('detail').scrollTop;
  const detailHTML = `<div class="site-head"><div><h3>${escape(p.name)}${b && !['hut', 'residence', 'tradepost'].includes(b.type) ? ' · ' + b.level + '. szint' : ''}</h3><p>${escape(note)}</p></div><button id="dismissdetail" aria-label="Panel bezárása">✕</button></div><div class="site-rows">${rows}</div>${action ? `<div class="site-actions"><button id="siteaction" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button></div>` : ''}`;
  if (detailOwner !== selected) {
    $('detail').innerHTML = detailHTML;
    detailOwner = selected;
    $('detail').scrollTop = 0;
  } else patchMarkup($('detail'), detailHTML);
  $('dismissdetail').onclick = () => {
    selected = null;
    detail();
  };
  $('detail').scrollTop = keepDetailScroll ? previousScroll : 0;
  if ($('craftamount')) {
    const recipe = RECIPES[TYPES[b.type].recipe],
      slider = $('craftamount');
    const preview = () => {
      craftChoice.units = Math.max(0, Math.floor(Number(slider.value)));
      const inputs = Object.fromEntries(
          Object.entries(recipe.input).map(([k, n]) => [k, n * craftChoice.units]),
        ),
        outputs = Object.fromEntries(
          Object.entries(recipe.output).map(([k, n]) => [k, n * craftChoice.units]),
        );
      $('craftpreview').innerHTML =
        materialAmounts(inputs, renderer) + '<span>→</span>' + materialAmounts(outputs, renderer);
      const estimate = craftEstimate(s, b, craftChoice.units);
      $('crafttime').textContent = estimate
        ? 'Becsült elkészülés: kb. ' +
          durationText(estimate) +
          (productionProgress(s, b) ? ' (a folyó munkával együtt)' : '')
        : 'Válassz mennyiséget a csúszkán.';
      $('startcraft').disabled = craftChoice.units === 0;
      $('startcraft').textContent = productionProgress(s, b)
        ? 'Hozzáadom a munkához'
        : 'Gyártás indítása';
      slider.setAttribute(
        'aria-valuetext',
        Object.entries(inputs)
          .map(([k, n]) => n + ' ' + RES[k][1])
          .join(', ') +
          ', ebből ' +
          Object.entries(outputs)
            .map(([k, n]) => n + ' ' + RES[k][1])
            .join(', '),
      );
    };
    slider.oninput = preview;
    slider.onpointerdown = () => {
      craftDragging = true;
    };
    slider.onchange = () => {
      if (craftDragging) slider.blur();
      craftDragging = false;
    };
    slider.onblur = () => {
      craftDragging = false;
    };
    $('startcraft').onclick = () => {
      settle();
      if (queueCraft(s, b.id, craftChoice.units)) {
        craftChoice.units = 0;
        craftDragging = false;
        save();
        render(true);
        toast('A kiválasztott alapanyag a műhelybe került. A késztermék a hátizsákba érkezik.');
      } else {
        toast('Ehhez a mennyiséghez már nincs elég alapanyagod.');
        render(true);
      }
    };
    preview();
  }
  if ($('deliverorder')) $('deliverorder').onclick = () => finishOrder(p);
  if (action)
    $('siteaction').onclick = () => {
      if (action === 'approach') approachSite(p);
      if (action === 'inspect') inspect(p);
      if (action === 'carpenter') openCarpenter();
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
          if (!s.chapter) maybeEvent(s);
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
function renderVoyageDetail(p, view) {
  const host = $('detail'),
    scroll = detailOwner === selected ? host.scrollTop : 0;
  host.hidden = false;
  patchMarkup(
    host,
    `<div class="site-head"><div><h3>${escape(view.title)}</h3><p>${escape(view.note)}</p></div><button id="dismissdetail" aria-label="Panel bezárása">✕</button></div>${view.html}`,
  );
  detailOwner = selected;
  host.scrollTop = scroll;
  $('dismissdetail').onclick = () => {
    selected = null;
    detail();
  };
  host.querySelectorAll('[data-voyage-action]').forEach(
    (button) =>
      (button.onclick = () => {
        const action = button.dataset.voyageAction;
        if (action === 'approach') {
          approachSite(p);
          return;
        }
        if (action === 'diary') {
          dialog(
            'Egy elázott hajónapló',
            'A lapok közt a szigeted partvonala és egy régi rakodó rajza látszik. Az utolsó olvasható sor: „Ha újra fény lesz az öbölben, megtaláljuk egymást.” A bázis mögötti parton még lehet nyoma a kikötőnek.',
            [
              {
                label: 'Megőrzöm a naplót',
                run: () => {
                  readVoyageDiary(s);
                  save();
                  $('storymodal').close();
                  render(true);
                },
              },
            ],
          );
          return;
        }
        settle();
        if (action.startsWith('sail:')) {
          if (beginSailing(s, action.slice(5))) {
            route = [];
            drive = { x: 0, y: 0 };
            selected = null;
            closeSheet();
            save();
            render(true);
          }
          return;
        }
        const result = applyVoyageAction(s, p, action);
        if (result.feedback) s.voyage.feedback = result.feedback;
        if (result.ok) {
          save();
          render(true);
        }
        if (result.feedback && $('gate-feedback')) $('gate-feedback').textContent = result.feedback;
      }),
  );
}
function updateSailingOverlay() {
  const trip = s.voyage?.travel,
    layer = $('sailing');
  layer.hidden = !trip;
  if (!trip) return;
  $('sailingtitle').textContent = trip.to === 'home' ? 'Úton hazafelé' : 'Úton Borostyán-szigetre';
  $('sailingboat').src = renderer.thumbnail('voyage', 7, 256) || '';
  $('sailingprogress').value = trip.elapsed / trip.total;
  layer.style.setProperty('--sail', String(trip.elapsed / trip.total));
}
function finishOrder(p) {
  const order = activeOrder(s, p.id);
  if (order && deliverOrder(s, p.id, order.id)) {
    syncWorkers(s);
    save();
    render(true);
    toast(order.benefit || 'A kereskedő átvette az anyagokat és kifizette az ezüstöt.');
  }
}
function refreshDetailValues() {
  const p = selectedSite(),
    b = p?.buildingId && s.buildings.find((v) => v.id === p.buildingId);
  if (p && voyagePanel(s, p, renderer)) return;
  if (!p || $('detail').hidden || craftDragging || document.activeElement?.id === 'craftamount')
    return;
  $('detail')
    .querySelectorAll('[data-available]')
    .forEach((el) => {
      const k = el.dataset.material,
        n = Number(el.dataset.required),
        owned = Math.floor(s.resources[k]);
      el.querySelector('strong').textContent = owned + ' / ' + n;
      el.classList.toggle('missing', owned < n);
    });
  const slider = $('craftamount');
  if (slider && b) {
    const recipe = RECIPES[TYPES[b.type].recipe];
    slider.max = String(craftLimit(s, recipe));
    patchMarkup(
      $('detail').querySelector('.craft-stock'),
      'Készleted: ' +
        materialAmounts(
          Object.fromEntries(Object.keys(recipe.input).map((k) => [k, Math.floor(s.resources[k])])),
          renderer,
        ),
    );
    slider.oninput?.();
    const work = productionProgress(s, b),
      box = $('detail').querySelector('.work-status');
    if (work && box) {
      box.querySelector('b').textContent =
        `Folyamatban: ${work.completed} / ${work.total} ${RES[work.outputKind][1].toLowerCase()} kész`;
      box.querySelector('progress').value = work.fraction;
      patchMarkup(
        box.querySelector('p'),
        'Feldolgozásra vár: ' +
          materialAmounts(work.inputLeft, renderer) +
          ' → ' +
          materialAmounts(work.outputLeft, renderer),
      );
    }
  }
  const deliver = $('deliverorder');
  if (deliver) {
    const order = activeOrder(s, p.id);
    deliver.disabled = !order || !afford(s, order.needs);
  }
  const button = $('siteaction');
  if (button) {
    const action = button.dataset.action;
    if (action === 'upgrade')
      button.disabled = !afford(s, upgradeCost(b) || {}) || !canUpgradeBuilding(s, b);
    if (action === 'restore') button.disabled = !restoration(s, p.id).ok;
    if (action === 'order') {
      const order = activeOrder(s, p.id);
      button.disabled = !order || !afford(s, order.needs);
    }
  }
}
let detailSignature = '';
function render(force = false) {
  updateSailingOverlay();
  $('resources').innerHTML = Object.entries(RES)
    .filter(([k]) => ['wood', 'stone', 'food', 'gold'].includes(k))
    .map(
      ([k, [icon, name]]) =>
        `<div class="resource ${k === 'food' && s.resources.food <= 0 ? 'low' : ''}" aria-label="${name}" title="${name}${k === 'food' ? ' · A munkások ellátása és fejlesztések' : ''}"><span class="ico">${icon}</span><b>${Intl.NumberFormat('hu', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.floor(s.resources[k]))}</b></div>`,
    )
    .join('');
  $('nextgoal').textContent = 'Feladat: ' + currentTask(s).title;
  $('nextgoal').setAttribute('aria-expanded', String(sheet === 'quests'));
  $('backpack').innerHTML = materialIcon('backpack', renderer);
  const q = supplySummary(awayEconomy(s)),
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

  const p = selectedSite(),
    b = p?.buildingId ? s.buildings.find((v) => v.id === p.buildingId) : null;
  const signature = JSON.stringify([
    selected,
    !!(b && productionProgress(s, b)),

    p?.inspected,
    p?.restored,
    p?.salvaged,
    b?.level,

    s.adventure.items['repair-kit'] || 0,
    p && Math.hypot(s.hero.x - p.x, s.hero.y - p.y) <= 1.8,
  ]);
  if (
    force ||
    (selectedSite() && voyagePanel(s, selectedSite(), renderer)) ||
    signature !== detailSignature
  ) {
    detail();
    detailSignature = signature;
  }
  refreshDetailValues();
  if (force || sheet === 'supply' || sheet === 'inventory') renderPanel();
}
function inspect(p) {
  if (!p) return;
  if (p.voyageRole && p.noticeAccepted) {
    inspectVoyageSite(s, p.id);
    save();
    render(true);
    return;
  }
  if (needsNotice(s, p)) {
    openSiteIntroduction(p);
    return;
  }
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
    if (p.kind === 'wreck' && p.salvaged) {
      dialog(
        'A roncs maradványai',
        'A hajó a sekély vízben akadt fenn. A partra sodródott holmikból használható fát, követ és élelmet mentettél ki.',
        [
          {
            label: 'Vissza a partra',
            run: () => {
              $('storymodal').close();
            },
          },
        ],
        `<p>Megmentett holmik</p>${materialAmounts(WRECK_SUPPLIES, renderer)}<p>A készlet már a hátizsákodban van.</p>`,
      );
      return;
    }
    if (!openBaseWelcome() && !(p.type === 'hut' && openCarpenter()) && !noticeEligible(p))
      toast(r.text);
  } else approachSite(p);
}
function selectSite(id) {
  route = [];
  siteTarget = null;
  encounterTarget = null;
  drive = { x: 0, y: 0 };
  delete s.hero.job;
  delete s.hero.siteWork;
  encounterTarget = null;
  selectedWorker = null;
  selected = id;
  const p = selectedSite();
  if (p && needsNotice(s, p) && Math.hypot(s.hero.x - p.x, s.hero.y - p.y) <= 1.8)
    openSiteIntroduction(p);
  else if (p && !p.inspected) approachSite(p);
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
  if (s.voyage?.travel) {
    const arrived = advanceSailing(s, dt);
    updateSailingOverlay();
    if (arrived) {
      activate(s);
      revealAround(s, s.hero, 2.5);
      save();
      render(true);
      dialog(
        s.voyage.currentIsland === 'echo' ? 'Borostyán-sziget' : 'Újra otthon',
        s.voyage.currentIsland === 'echo'
          ? 'A hajód csendes öbölbe ér. A part mentén régi ösvény vezet a fák közé. A visszaút bármikor nyitva áll.'
          : 'Az otthoni telepek megvártak. A munkák és a termelés folytatódtak, amíg távol voltál.',
        [
          {
            label: 'Partra lépek',
            run: () => {
              if (s.voyage.currentIsland === 'echo') inspectVoyageSite(s, 'echo-landing');
              $('storymodal').close();
              save();
              render(true);
            },
          },
        ],
      );
    }
    return;
  }
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
        const beforeGather = s.resources[node.kind];
        const result = advanceGathering(s, dt);
        s.hero.action = result.finished ? 'idle' : node.kind === 'wood' ? 'chop' : 'mine';
        s.hero.workTime = result.clock || 0;
        s.hero.targetAngle = Math.atan2(-(node.x - s.hero.x), node.y - s.hero.y);
        if (result.impacts) {
          const amount = Number((s.resources[node.kind] - beforeGather).toFixed(3));
          if (amount > 0) renderer.showGain({ kind: node.kind, amount, x: node.x, y: node.y });
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
    sites
      .filter((p) => !noticeEligible(p))
      .forEach((p) => toast('Új helyszínt találtál: ' + p.name));
    if (found) {
      if (!s.chapter) maybeEvent(s);
      save();
      render();
    }
  }
  checkNearbyIntroductions();
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
window.addEventListener('pointercancel', () => {
  craftDragging = false;
  $('craftamount')?.blur();
});
window.addEventListener('pointerup', () => {
  if (craftDragging) {
    craftDragging = false;
    $('craftamount')?.blur();
  }
});
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
function dialog(title, text, buttons, extras = '') {
  drive = { x: 0, y: 0 };
  $('detail').hidden = true;
  closeSheet();
  $('storymodal').classList.remove('place-notice');
  $('storytitle').textContent = title;
  $('storytext').textContent = text;
  $('storyactions').replaceChildren();
  $('storyextras').innerHTML = extras;
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
const nearNotices = new Set();
function checkNearbyIntroductions() {
  if ($('storymodal').open || $('modal').open || sheet || !s.adventure.tutorialSeen) return;
  const candidates = nearbyNotices(s),
    current = new Set(candidates.map((p) => p.id));
  const first = candidates
    .filter((p) => !nearNotices.has(p.id))
    .sort(
      (a, b) =>
        Math.hypot(s.hero.x - a.x, s.hero.y - a.y) - Math.hypot(s.hero.x - b.x, s.hero.y - b.y),
    )[0];
  nearNotices.clear();
  current.forEach((id) => nearNotices.add(id));
  if (first) openSiteIntroduction(first);
}
function openSiteIntroduction(p) {
  if (!needsNotice(s, p) || Math.hypot(s.hero.x - p.x, s.hero.y - p.y) > 1.8) return false;
  nearNotices.add(p.id);
  route = [];
  siteTarget = null;
  encounterTarget = null;
  drive = { x: 0, y: 0 };
  selected = null;
  detail();
  if (p.type === 'hut') {
    if (!p.inspected) {
      inspectSite(s, p.id);
      save();
    }
    return openBaseWelcome();
  }
  const notice = siteNotice(p, s);
  dialog(notice.title, notice.text, [
    {
      label: notice.button,
      run: () => {
        if (!acknowledgeSiteNotice(s, p.id)) return;
        save();
        $('storymodal').close();
        selected = p.id;
        inspect(p);
      },
    },
    {
      label: 'Most nem',
      run: () => {
        $('storymodal').close();
        selected = null;
        detail();
      },
    },
  ]);
  $('storymodal').classList.add('place-notice');
  return true;
}
function openCarpenter() {
  if (!carpenterWaiting(s)) return false;
  const base = s.adventure.sites.find((p) => p.type === 'hut');
  if (!base || Math.hypot(s.hero.x - base.x, s.hero.y - base.y) > 1.8) return false;
  dialog('Egy ács a küszöbön', carpenterSpeech(s), [
    {
      label: 'Segítek rendbe hozni a házad',
      run: () => {
        if (introduceCarpenter(s)) {
          save();
          $('storymodal').close();
          render(true);
        }
      },
    },
  ]);
  return true;
}
function openBaseWelcome() {
  const found = pendingBaseWelcome(s);
  const place = found && siteById(s, found.siteId);
  if (!found || Math.hypot(s.hero.x - place.x, s.hero.y - place.y) > 1.8) return false;
  selected = null;
  detail();
  dialog(
    'Egy hely, ahonnan elindulhatsz',
    'A ház régóta üresen áll, de a tető még tart. Odabent félretett faanyagot, követ és egy kis élelemtartalékot találsz. Rendbe hozva ez lehet a bázisod, ahonnan felfedezheted a szigetet.',
    [
      {
        label: 'Rendbe hozom a házat',
        run: () => {
          acknowledgeSiteNotice(s, found.siteId);
          acknowledgeBaseWelcome(s, found.siteId);
          save();
          $('storymodal').close();
          closeSheet();
          selected = found.siteId;
          selectedWorker = null;
          detail();
        },
      },
      {
        label: 'Most nem',
        run: () => {
          $('storymodal').close();
          selected = null;
          detail();
        },
      },
    ],
  );
  $('storymodal').classList.add('place-notice');
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
    'Húzd és tartsd az ujjad a világon: a karakter fut. Két ujjal mozgatod és nagyítod a kamerát.\n\nA készleteket a hátizsákban látod, a fejleszthető épületeket nyíl jelzi. Koppints egy látható tárgyra vagy helyszínre: a karakter odamegy és megvizsgálja. Mindig egy aktuális feladat vezet tovább. A felső Feladat sorra koppintva látod a teendőt és a szükséges anyagokat.\n\nA dolgozók maguktól esznek és pihennek. Az ellátottságjelzőnél látod a fogyasztást és az energiaállapotokat. A sziget történetét és lehetőségeit a helyszíneken ismered meg.',
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
  if (kind === 'trader' && (s.chapter || s.adventure.pending?.type !== 'visitor')) {
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
  nearNotices.clear();
  camera.focus = { x: s.hero.x, y: s.hero.y };
  camera.x = camera.y = 0;
  if (s.worldVersion === 5) camera.zoom = Math.min(camera.zoom, 0.98);
  camera.follow = true;
  closeSheet();
  settleAway(s, Date.now());
  const caught = tick(s, Date.now(), false);
  produceOfflineWorkers(s, caught);
  save();
  render(true);
}
$('settings').onclick = () => {
  drive = { x: 0, y: 0 };
  $('saveinfo').textContent =
    `Játékverzió: 0.14 · Mentés: v${s.version}. ${s.archive ? 'A megőrzött szigeteid ugyanebben a mentésben vannak.' : 'Automatikus mentés ezen az eszközön.'}`;
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
    localStorage.getItem('szigetkert.backup.pre-v14-v9') ||
    localStorage.getItem('szigetkert.backup.pre-v13') ||
    localStorage.getItem('szigetkert.backup.pre-v12-v8') ||
    localStorage.getItem('szigetkert.backup.pre-simplification-v7') ||
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
    const rawImport = await f.text();
    const candidate = importGame(rawImport);
    $('modal').close();
    dialog(
      'Játékállás betöltése',
      'A kiválasztott mentés lecseréli a mostani játékállást. A jelenlegi állásról előtte helyi biztonsági másolat készül.',
      [
        { label: 'Mégse', run: () => $('storymodal').close() },
        {
          label: 'Betöltöm a mentést',
          run: () => {
            try {
              localStorage.setItem('szigetkert.backup.pre-import', JSON.stringify(s));
              if (
                JSON.parse(rawImport).version <= 8 &&
                !localStorage.getItem('szigetkert.backup.pre-v14-v9')
              )
                localStorage.setItem('szigetkert.backup.pre-v14-v9', rawImport);
              saveOK = true;
              $('storymodal').close();
              activate(candidate);
              if (!s.adventure.introSeen || !s.adventure.tutorialSeen) openIntro();
              else openBaseWelcome();
              toast('A szigeted betöltődött.');
            } catch (error) {
              toast('A mentés nem tölthető be: ' + error.message);
            }
          },
        },
      ],
    );
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
  if ($('modal').open || $('storymodal').open || s.voyage?.travel) return;
  if (e.target?.closest?.('input, textarea, select, button, [contenteditable]')) return;
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

$('storymodal').addEventListener('cancel', () => {
  selected = null;
  detail();
});
