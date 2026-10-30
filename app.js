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
  chooseEvent,
  restoredType,
  siteCost,
  traderOffers,
  trade,
} from './adventure.js';
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
  $('sheettitle').textContent = tab === 'sites' ? 'A felfedezett sziget' : 'Feladatok és események';
  renderPanel();
  document
    .querySelectorAll('[data-tab]')
    .forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.tab === tab)));
}
function siteThumbnail(p) {
  const b = p.buildingId ? s.buildings.find((b) => b.id === p.buildingId) : null,
    src = b
      ? renderer.thumbnail('village', buildingFrame(b.type, b.level))
      : renderer.thumbnail('expedition', p.kind === 'bridge' && p.restored ? 5 : (p.art ?? 8));
  return src
    ? `<img class="site-picture" src="${src}" alt="">`
    : '<span class="site-picture"></span>';
}
function renderPanel() {
  if (!sheet) return;
  if (sheet === 'sites') {
    const sites = s.adventure.sites.filter((p) => knownSite(s, p));
    $('panel').innerHTML =
      `<p class="hint">${supplyFactor(s) < 1 ? 'Kevés az élelem. A munkák lassabbak, de senki nincs veszélyben.' : 'A megtalált helyszíneket vizsgálhatod meg, majd helyreállíthatod.'}</p><div class="site-list">${sites.map((p) => `<button data-site="${escape(p.id)}">${siteThumbnail(p)}<span><b>${escape(p.name)}</b><small>${p.restored ? 'Működik' : p.salvaged ? 'Átvizsgálva' : p.inspected ? 'Helyreállításra vár' : 'Megvizsgálható'}</small></span></button>`).join('')}</div>`;
    if (s.adventure.trader?.active) {
      const button = document.createElement('button');
      button.className = 'event-card';
      button.textContent = 'Vándorkereskedő · Ajánlatok és útbaigazítás';
      button.onclick = () => {
        closeSheet();
        openTrader();
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
      `<article class="quest-story"><b>Következő lépés</b><p>${escape(objective(s))}</p><small>A helyszínek vizsgálata és helyreállítása viszi előre a történetet.</small></article>${e ? `<button id="pendingevent" class="event-card"><b>${escape(e.title)}</b><span>Megnézem · később is folytatható</span></button>` : ''}${s.adventure.items.route || s.adventure.items.trail ? '<article class="quest-story remembered"><b>Megjegyzett nyom</b><p>A túlparti ösvény régi útjeleit már felismered. A hallottakat és a megjelölt nyomokat megőrizted.</p></article>' : ''}${s.adventure.items['repair-kit'] ? '<p class="hint">Van javítókészleted: a következő helyreállítás 20%-kal kevesebb anyagot kér.</p>' : ''}<p class="hint">Nincs napi kötelezettség vagy lejáró jutalom. A megtalált nyomok és a döntéseid megmaradnak.</p>`;
    if (e)
      $('pendingevent').onclick = () => {
        closeSheet();
        openEvent();
      };
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
  } else if (p.kind === 'wreck' || p.kind === 'marker') {
    note = p.salvaged
      ? 'Ezt a helyet már megvizsgáltad.'
      : 'A régi nyomokat még érdemes közelebbről megnézni.';
    action = p.salvaged ? '' : 'inspect';
    label = 'Megvizsgálom';
  } else if (!p.restored) {
    const check = restoration(s, p.id);
    note = check.reason;
    rows = `<div><span>Szükséges</span><b>${escape(cost(siteCost(s, p)))}</b></div>`;
    action = 'restore';
    label = 'Helyreállítás';
    disabled = !check.ok;
  } else if (b) {
    const price = upgradeCost(b),
      next = { ...b, level: (b.level || 1) + 1 };
    const active = s.workers.filter(
      (w) => w.buildingId === b.id && !['inside', 'entering'].includes(w.phase),
    ).length;
    note = workerCount(b)
      ? `${workerCount(b)} munkás · ${active} a szabadban${supplyFactor(s) < 1 ? ' · csökkent ellátás' : ''}`
      : 'Ez a hely újra szolgálja a szigetet.';
    if (price) {
      rows = `<div><span>Következő fejlesztés</span><b>${b.level + 1}. szint</b></div><div><span>Névleges termelés</span><b>${(buildingRate(s, b) * 60).toFixed(1)} → ${(buildingRate(s, next) * 60).toFixed(1)}/perc</b></div>${workerCount(b) ? `<div><span>Munkások</span><b>${workerCount(b)} → ${workerCount(next)}</b></div>` : ''}<div><span>Szükséges</span><b>${escape(cost(price))}</b></div>`;
      action = 'upgrade';
      label = 'Fejlesztés';
      disabled = !afford(s, price);
    } else note += ' · Teljesen fejlesztve';
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
  $('questdot').textContent = s.adventure.pending ? '•' : '';
  const p = selectedSite(),
    b = p?.buildingId ? s.buildings.find((v) => v.id === p.buildingId) : null;
  const signature = JSON.stringify([
    selected,
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
  if (force) renderPanel();
}
function inspect(p) {
  const r = inspectSite(s, p.id);
  if (r.ok) {
    save();
    toast(r.text);
    render(true);
  } else approachSite(p);
}
function selectSite(id) {
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
  if (!ready) return;
  updateWorkers(s, dt);
  const paused = $('storymodal').open || $('modal').open;
  s.hero.action = 'idle';
  if (!paused) {
    if (Math.hypot(drive.x, drive.y) > 0.04) {
      route = [];
      siteTarget = null;
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
    const found = revealAround(s, s.hero, s.worldVersion === 2 ? 2.5 : 2.8);
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
        if (!s.adventure.introSeen) openIntro();
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
    if (hit.event) {
      openTrader();
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
function openIntro() {
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
    'Sós homok tapad a ruhádhoz. A hajóból csak törött gerendák maradtak. A köd mögött egy ösvény indul az erdőbe.',
    [
      {
        label: 'Felállok',
        run: () => {
          s.adventure.introSeen = true;
          save();
          $('storymodal').close();
          toast('Húzd és tartsd az ujjad a futáshoz. Két ujjal mozgathatod a kamerát.');
        },
      },
    ],
  );
}
function openEvent() {
  const e = eventView(s);
  if (!e) return;
  dialog(
    e.title,
    e.text,
    e.choices
      .map((c) => ({
        label: c.text + (c.cost ? ' · ' + cost(c.cost) : ''),
        disabled: !afford(s, c.cost || {}),
        run: () => {
          if (chooseEvent(s, c.id)) {
            save();
            $('storymodal').close();
            render(true);
            toast('A döntésed és a talált nyomok megmaradnak.');
          }
        },
      }))
      .concat([{ label: 'Később folytatom', run: () => $('storymodal').close() }]),
  );
}
function openTrader() {
  if (s.adventure.pending?.type === 'visitor') {
    openEvent();
    return;
  }
  const t = s.adventure.trader;
  if (!t) return;
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
      {
        label: 'Az útjelekről kérdezek',
        run: () => {
          s.adventure.items.route = 1;
          save();
          dialog(
            'Egy régi jel',
            'A túlparti ösvényen keress egy megkopott útjelzőt. Most már tudod, hogyan olvasd a rajta lévő jeleket.',
            [{ label: 'Megjegyzem', run: () => $('storymodal').close() }],
          );
        },
      },
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
    `Játékverzió: 0.8 · Mentés: v${s.version}. ${s.archive ? 'Mindkét szigeted ugyanebben a mentésben van.' : 'Automatikus mentés ezen az eszközön.'}`;
  $('switchcampaign').textContent = s.archive
    ? 'Váltás a másik megőrzött szigetre'
    : 'Új kaland, a jelenlegi sziget megőrzésével';
  $('modal').showModal();
};
$('close').onclick = () => $('modal').close();
$('switchcampaign').onclick = () => {
  settle();
  activate(switchCampaign(s));
  $('modal').close();
  if (!s.adventure.introSeen) openIntro();
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
    if (!s.adventure.introSeen) openIntro();
    toast('A szigeted betöltődött.');
  } catch (e) {
    toast(e.message);
  } finally {
    $('import').value = '';
  }
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
