import { buildingFrame } from './art.js';
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
  knownSite,
  siteById,
  inspectSite,
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
    .map(([k, v]) => `${RES[k][0]} ${Math.ceil(v)}`)
    .join('  ');
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500);
}
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
      : tab === 'supply'
        ? 'Munka és ellátás'
        : 'Feladatok és nyomok';
  renderPanel();
  document
    .querySelectorAll('[data-tab]')
    .forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.tab === tab)));
}
function siteThumbnail(p) {
  const b = p.buildingId ? s.buildings.find((b) => b.id === p.buildingId) : null,
    src = b
      ? renderer.thumbnail('village', buildingFrame(b.type, b.level))
      : p.type === 'hut'
        ? renderer.thumbnail('village', 0)
        : renderer.thumbnail('expedition', p.kind === 'bridge' && p.restored ? 5 : (p.art ?? 8));
  return src
    ? `<img class="site-picture" src="${src}" alt="">`
    : '<span class="site-picture"></span>';
}
function renderPanel() {
  if (!sheet) return;
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
      `<article class="quest-story"><b>Ellátottság: ${q.level}% · ${q.label}</b><p>${q.working} dolgozik · ${q.resting} pihen · ${q.waiting} várakozik</p><div class="supply-meter"><i style="width:${q.level}%"></i></div></article><div class="site-rows"><div><span>Élelemtermelés</span><b>${fmt(q.production)}/perc</b></div><div><span>Tervezett élelemfogyasztás</span><b>${fmt(q.demand)}/perc</b></div><div><span>Ellátás miatti munkatempó</span><b>${Math.round(supplyFactor(s) * 100)}%</b></div><div><span>Tervezett egyenleg</span><b>${q.net >= 0 ? '+' : ''}${fmt(q.net)}/perc</b></div></div><p>${escape(reserve)}</p><p class="hint">A fogyasztás teljes munkaterhelésre becsült. A munkások kb. 2 perc tényleges munka után maguktól esznek és pihennek. Teljes adag: 2 élelem, pihenő: 20 mp. Étel nélkül hosszabb a pihenő és lassabb a munka. Senki nem hal meg. A szigetet bezárva az egyéni energia nem csökken.</p><div class="site-list">${s.workers.map((w, i) => `<button data-worker="${escape(w.id)}"><span><b>${s.buildings.find((b) => b.id === w.buildingId)?.type === 'quarry' ? 'Bányász' : 'Favágó'} ${i + 1} · Energia: ${Math.round(w.energy)}%</b><small>${escape(w.recovery ? 'Étkezés / pihenés' : w.status || 'Munkára kész')}</small></span></button>`).join('')}</div>`;
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
    const sites = s.adventure.sites.filter((p) => knownSite(s, p));
    $('panel').innerHTML =
      `<p class="hint">${s.resources.food < 2 && s.workers.length ? 'Kevés az élelem. A következő étkezésekhez utánpótlás kell.' : supplySummary(s).level < 70 ? 'Az ellátottság a sikeres étkezésekkel fokozatosan helyreáll.' : 'A megtalált helyszíneket vizsgálhatod meg, majd helyreállíthatod.'}</p><div class="site-list">${sites.map((p) => `<button data-site="${escape(p.id)}">${siteThumbnail(p)}<span><b>${escape(p.name)}</b><small>${p.kind === 'forage' ? 'Gyűjtögethető' : p.restored ? 'Működik' : p.salvaged ? 'Átvizsgálva' : p.inspected ? 'Helyreállításra vár' : 'Megvizsgálható'}</small></span></button>`).join('')}</div>`;
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
    const e = eventView(s);
    $('panel').innerHTML =
      `<article class="quest-story"><b>Következő lépés</b><p>${escape(objective(s))}</p></article>${e ? `<article class="quest-story"><b>${escape(e.title)}</b><p>${escape(e.text)}</p></article>` : ''}${s.adventure.lastDiscovery ? `<article class="quest-story remembered"><b>${escape(s.adventure.lastDiscovery.title)} · Megtalálva</b><p>${escape(s.adventure.lastDiscovery.text)}</p></article>` : ''}${s.adventure.items.route || s.adventure.items.trail ? '<p class="hint">A megismert útjeleket felismered, ha újra találkozol velük.</p>' : ''}<p class="hint">A nyomokhoz tartozó dolgokat a szigeten kell megtalálnod és megvizsgálnod. Nincs lejáró feladat.</p>`;
  }
}
function selectedSite() {
  return selected ? siteById(s, selected) : null;
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
  } else if (p.kind === 'forage') {
    note = 'Kis adag élelem gyűjthető itt. Új adag 30 másodperc aktív játék után.';
    action = 'inspect';
    label = 'Gyűjtök';
  } else if (p.kind === 'wreck' || p.kind === 'marker') {
    note = p.salvaged
      ? 'Ezt a helyet már megvizsgáltad.'
      : 'A régi nyomokat még érdemes közelebbről megnézni.';
    action = p.salvaged ? '' : 'inspect';
    label = 'Megvizsgálom';
  } else if (!p.restored) {
    const check = restoration(s, p.id);
    note =
      (p.type === 'farm'
        ? 'Helyreállítva közvetlenül élelmet termel. '
        : p.type === 'hut'
          ? 'Kezdőbázis: közös készlet és találkozóhely. Nem termel. '
          : '') + check.reason;
    if (p.type && p.type !== 'hut')
      rows = `<div><span>${RES[TYPES[p.type].output][1]}</span><b>${(buildingRate(s, { type: p.type, level: 1 }) * 60).toFixed(1)}/perc</b></div>`;
    rows += `<div><span>Szükséges</span><b>${escape(cost(siteCost(s, p)))}</b></div>`;
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
    } else {
      const workers = s.workers.filter((w) => w.buildingId === b.id),
        rest = workers.filter((w) => w.recovery).length,
        active = workers.filter((w) =>
          ['outbound', 'working', 'returning', 'entering', 'emerging'].includes(w.phase),
        ).length;
      note = workers.length
        ? `${active} dolgozik · ${rest} pihen · ${workers.length - active - rest} várakozik`
        : 'Folyamatos termelés a közös készletbe.';
      const material = RES[TYPES[b.type].output][1];
      rows = `<div><span>${material}${workers.length ? ' (becsült)' : ''}</span><b>${(buildingRate(s, b) * 60).toFixed(1)}/perc</b></div>`;
      if (price) {
        rows += `<div><span>Következő fejlesztés</span><b>${b.level + 1}. szint</b></div><div><span>${material}termelés</span><b>${(buildingRate(s, b) * 60).toFixed(1)} → ${(buildingRate(s, next) * 60).toFixed(1)}/perc</b></div>${workers.length ? `<div><span>Munkások</span><b>${workerCount(b)} → ${workerCount(next)}</b></div><div><span>Tervezett élelemigény</span><b>${workerCount(b)} → ${workerCount(next)}/perc</b></div>` : ''}<div><span>Szükséges</span><b>${escape(cost(price))}</b></div>`;
        action = 'upgrade';
        label = 'Fejlesztés';
        disabled = !afford(s, price);
      } else note += ' · Teljesen fejlesztve';
    }
  } else note = 'Az átjáró új lehetőséget nyitott.';
  $('detail').hidden = false;
  $('detail').innerHTML =
    `<div class="site-head"><div><h3>${escape(p.name)}${b ? ' · ' + b.level + '. szint' : ''}</h3><p>${escape(note)}</p></div><button id="dismissdetail" aria-label="Panel bezárása">✕</button></div><div class="site-rows">${rows}</div>${action ? `<div class="site-actions"><button id="siteaction" ${disabled ? 'disabled' : ''}>${label}</button></div>` : ''}`;
  $('dismissdetail').onclick = () => {
    selected = null;
    detail();
  };
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
let detailSignature = '';
function render(force = false) {
  $('resources').innerHTML = Object.entries(RES)
    .map(
      ([k, [icon, name]]) =>
        `<div class="resource ${k === 'food' && s.resources.food <= 0 ? 'low' : ''}" aria-label="${name}" title="${name}${k === 'food' ? ' · A munkások ellátása és fejlesztések' : ''}"><span class="ico">${icon}</span><b>${Intl.NumberFormat('hu', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.floor(s.resources[k]))}</b></div>`,
    )
    .join('');
  $('nextgoal').textContent = objective(s);
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
  if (force || sheet === 'supply') renderPanel();
}
function inspect(p) {
  if (!p) return;
  const r = inspectSite(s, p.id);
  if (r.ok) {
    save();
    toast(r.text);
    render(true);
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
      if (driveHero(s, drive, dt)) s.hero.action = 'run';
      camera.follow = true;
    } else if (route.length) {
      advanceHero(s, route, dt, 1.7);
      s.hero.action = 'run';
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
    if (sites.length) toast('Új helyszínt találtál: ' + sites[0].name);
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
  for (const action of buttons) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.disabled = !!action.disabled;
    b.onclick = action.run;
    $('storyactions').append(b);
  }
  if (!$('storymodal').open) $('storymodal').showModal();
}
function showHelp() {
  dialog(
    'Így működik a sziget',
    'Húzd és tartsd az ujjad a világon: a karakter fut. Két ujjal mozgatod és nagyítod a kamerát.\n\nKoppints egy látható tárgyra vagy helyszínre: a karakter odamegy és megvizsgálja. A feladatok csak nyomot adnak, a megoldást neked kell megtalálnod.\n\nA bázis egyszeri készletet ad, utána nem termel. A gazdaság közvetlenül élelmet biztosít. A dolgozók maguktól esznek és pihennek. A kezdőkészlet véges; az ellátottságjelzőnél láthatod a fogyasztást és az energiaállapotokat.',
    [
      {
        label: 'Értem',
        run: () => {
          s.adventure.tutorialSeen = true;
          save();
          $('storymodal').close();
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
    `Játékverzió: 0.9 · Mentés: v${s.version}. ${s.archive ? 'Mindkét szigeted ugyanebben a mentésben van.' : 'Automatikus mentés ezen az eszközön.'}`;
  $('switchcampaign').textContent = s.archive
    ? 'Váltás a másik megőrzött szigetre'
    : 'Új kaland, a jelenlegi sziget megőrzésével';
  $('backup').hidden = !localStorage.getItem('szigetkert.backup.pre-supply-v5');
  $('modal').showModal();
};
$('close').onclick = () => $('modal').close();
$('switchcampaign').onclick = () => {
  settle();
  activate(switchCampaign(s));
  $('modal').close();
  if (!s.adventure.introSeen || !s.adventure.tutorialSeen) openIntro();
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
$('backup').onclick = () => {
  try {
    const raw = localStorage.getItem('szigetkert.backup.pre-supply-v5');
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
