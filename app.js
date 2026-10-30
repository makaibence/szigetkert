import { loadGame, saveGame, importGame } from './save.js';
import { setupOffline } from './updates.js';
import { updateWorkers, produceOfflineWorkers, syncWorkers } from './workers.js';
import { regionUnlocked } from './world.js';
import {
  findPath,
  smoothPath,
  revealAround,
  advanceHero,
  walkable,
  resourcePath,
} from './navigation.js';
import { createRenderer } from './renderer.js';
import { attachGestures } from './gestures.js';
import {
  SIZE,
  TYPES,
  RES,
  fresh,
  terrain,
  key,
  rates,
  tick,
  afford,
  build,
  move,
  frontier,
  explore,
  gather,
  QUESTS,
  claim,
  validate,
  resourceTarget,
  harvestHit,
  placement,
  terrainAt,
  upgradeCost,
  upgrade,
  workerCount,
  productionMultiplier,
} from './engine.js';
const $ = (id) => document.getElementById(id);
let loadedSave;
try {
  loadedSave = loadGame();
} catch (error) {
  loadedSave = { state: fresh(), writable: false, error };
}
let s = loadedSave.state,
  saveOK = loadedSave.writable;
if (loadedSave.error)
  setTimeout(() => toast('A mentés nem olvasható. A régi adatot nem írjuk felül.'), 500);
const elapsed = tick(s, Date.now(), false);
produceOfflineWorkers(s, elapsed);
let previouslyHidden = document.hidden;
function settle() {
  const seconds = tick(s, Date.now(), false);
  if (previouslyHidden) produceOfflineWorkers(s, seconds);
}
let selected = null,
  chosen = null,
  moving = null,
  tab = 'build',
  sheetOpen = false,
  camera = {
    zoom: 1.12,
    x: 0,
    y: 0,
    anchorY: 0.53,
    follow: true,
    focus: { x: s.hero.x, y: s.hero.y },
  },
  hits = [],
  toastTimer;
let offline = elapsed > 60;
let heroPath = [],
  gatherTarget = null,
  gatherWait = 0,
  gatherHits = 0,
  gatherAmount = 0,
  nextImpact = 0.17,
  lastReveal = '';
const previousExplored = s.explored;
revealAround(s, s.hero, 2.8);
s.explored = previousExplored;
function toast(t) {
  $('toast').textContent = t;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500);
}
function save() {
  if (!saveOK) return false;
  try {
    saveGame(s);
    $('savestatus').textContent = '✓ Mentve ezen az eszközön';
    return true;
  } catch {
    $('savestatus').textContent = 'Mentés sikertelen · exportálj!';
    return false;
  }
}
const cost = (c) =>
  Object.entries(c)
    .map(([k, v]) => `${RES[k][0]} ${v}`)
    .join('  ');
let lastQuestState = '';
let lastAffordState = '';
function render(full = true) {
  const recommended =
    QUESTS.find((q) => q.kind === 'Fő küldetés' && !q.test(s)) || QUESTS.find((q) => !q.test(s));
  $('nextgoal').textContent = recommended
    ? 'Következő cél · ' + recommended.text
    : 'A településed virágzik · nézd meg a jutalmaidat';
  const r = rates(s);
  $('resources').innerHTML = Object.entries(RES)
    .map(
      ([k, [ico, name]]) =>
        `<div class="resource" aria-label="${name}" title="${name}"><span class="ico">${ico}</span><div><b>${Intl.NumberFormat('hu', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.floor(s.resources[k]))}</b></div></div>`,
    )
    .join('');
  $('questdot').textContent = QUESTS.some((q) => !s.claimed.includes(q.id) && q.test(s)) ? '•' : '';
  const qs = QUESTS.map((q) => `${q.test(s)}:${s.claimed.includes(q.id)}`).join();
  if (full || (selected && !chosen && moving === null)) detail();
  const affordability = Object.values(TYPES)
    .map((t) => afford(s, t.cost))
    .join();
  if (full || qs !== lastQuestState || affordability !== lastAffordState) panel();
  lastQuestState = qs;
  lastAffordState = affordability;
  draw();
}
function detail() {
  if (!selected) {
    if (chosen || moving !== null) {
      $('detail').hidden = false;
      $('detail').innerHTML =
        `<div><h3>${chosen ? TYPES[chosen].name + ' elhelyezése' : 'Épület áthelyezése'}</h3><p>Érints egy üres füves helyet.</p></div><button id="dismissdetail" aria-label="Elhelyezés megszakítása">✕</button>`;
      $('dismissdetail').onclick = () => {
        chosen = null;
        moving = null;
        selected = null;
        render();
      };
    } else $('detail').hidden = true;
    return;
  }
  $('detail').hidden = false;
  const { x, y } = selected,
    t = terrainAt(s, x, y),
    known = s.revealed.includes(key(x, y)),
    b = s.buildings.find((b) => b.x === x && b.y === y);
  let title,
    text,
    action = '',
    label = '';
  if (!known) {
    title = 'Ismeretlen vidék';
    text = 'Sétálj ide a felfedezéshez.';
    if (frontier(s, x, y)) {
      label = 'Indulok';
      action = 'explore';
    } else text = 'Először fedezz fel egy szomszédos mezőt.';
  } else if (b) {
    title = TYPES[b.type].name;
    const count = workerCount(b);
    text = `${b.level || 1}. szint · ${count ? count + ' munkás · névleg ' : ''}+${(TYPES[b.type].rate * 60 * productionMultiplier(b)).toFixed(1)} ${RES[TYPES[b.type].output][1].toLowerCase()}/perc`;
    if (count)
      text += ' · ' + (s.workers.find((w) => w.buildingId === b.id)?.status || 'Munkába állítás');
    action = 'move';
    label = 'Áthelyezés';
  } else if (t === 'forest' || t === 'mountain') {
    title = t === 'forest' ? 'Illatos fenyves' : 'Sziklás magaslat';
    text =
      'Három ütésből legfeljebb 3 nyersanyag. Többször gyűjthető, a készlet kimerülésekor eltűnik.';
    action = 'gather';
    label = t === 'forest' ? '+3 fa gyűjtése' : '+3 kő gyűjtése';
  } else if (t === 'water') {
    title = 'Csendes-öböl';
    text = 'Itt csak a hullámok építkeznek.';
  } else {
    title =
      moving !== null
        ? 'Új hely az épületnek'
        : chosen
          ? TYPES[chosen].name + ' helye'
          : 'Egy darabka lehetőség';
    text = 'Építkezés lent · válassz egy épületet.';
    if (moving !== null) {
      action = 'place';
      label = 'Áthelyezés ide';
      text = placement(s, x, y, s.buildings[moving]?.id).reason;
    } else if (chosen) {
      action = 'build';
      label = 'Építés';
      text = cost(TYPES[chosen].cost) + ' · ' + placement(s, x, y).reason;
    }
  }
  $('detail').innerHTML =
    `<div><h3>${title}</h3><p>${text}</p></div>${action ? `<button id="action">${label}</button>` : ''}<button id="dismissdetail" aria-label="Kijelölés bezárása">✕</button>`;
  if (b && moving === null && !chosen) {
    const price = upgradeCost(b);
    if (price) {
      const controls = document.createElement('div');
      controls.className = 'upgrade-controls';
      controls.innerHTML = `<small>Következő szint: ${cost(price)}</small><button id="upgrade" ${afford(s, price) ? '' : 'disabled'}>Fejlesztés · ${b.level + 1}. szint</button>`;
      $('detail').append(controls);
      $('upgrade').onclick = () => {
        settle();
        if (upgrade(s, b.id)) {
          syncWorkers(s);
          save();
          render();
          toast('Az épület fejlődött.');
        }
      };
    }
  }
  $('dismissdetail').onclick = () => {
    selected = null;
    chosen = null;
    moving = null;
    render();
  };
  if (action) $('action').onclick = () => act(action);
}
function act(a) {
  if (!selected) return;
  settle();
  let ok = false;
  const { x, y } = selected;
  if (a === 'gather') {
    startWalk({ x, y }, true);
    return;
  }
  if (a === 'explore') {
    startWalk({ x, y }, false);
    return;
  }
  if (a === 'build') {
    if (Math.round(s.hero.x) === x && Math.round(s.hero.y) === y) {
      toast('Ez a hely most a főszereplő alatt van. Válassz másikat.');
      return;
    }
    ok = build(s, chosen, x, y);
    if (ok) {
      chosen = null;
      heroPath = [];
      gatherTarget = null;
    }
  }
  if (a === 'move') {
    moving = s.buildings.findIndex((b) => b.x === x && b.y === y);
    chosen = null;
    toast('Érints egy üres füves mezőt, majd helyezd át.');
    render();
    return;
  }
  if (a === 'place') {
    if (Math.round(s.hero.x) === x && Math.round(s.hero.y) === y) {
      toast('A főszereplő helyére nem építhetsz.');
      return;
    }
    ok = move(s, moving, x, y);
    if (ok) moving = null;
  }
  toast(
    ok
      ? a === 'explore'
        ? 'A köd egy kicsit távolabb húzódott.'
        : a === 'gather'
          ? 'A készlet gyarapodott!'
          : 'A szigeted tovább épül!'
      : 'Ehhez még több erőforrás vagy szabad füves mező kell.',
  );
  save();
  render();
}
function panel() {
  if (tab === 'build') {
    $('panel').innerHTML = `<div class="cards">${Object.entries(TYPES)
      .map(
        ([id, t]) =>
          `<button class="card ${chosen === id ? 'selected' : ''} ${afford(s, t.cost) ? '' : 'unaffordable'}" aria-disabled="${!afford(s, t.cost)}" data-build="${id}"><span class="art art-${id}" aria-hidden="true"></span><b>${t.name}</b><small>${cost(t.cost)}${afford(s, t.cost) ? '' : ' · Kevés nyersanyag'}</small></button>`,
      )
      .join(
        '',
      )}</div><p class="hint">Válassz épületet, majd érints egy üres helyet. A favágótelep és kőbánya munkásai elérhető, felfedezett nyersanyagot keresnek.</p>`;
    document.querySelectorAll('[data-build]').forEach(
      (b) =>
        (b.onclick = () => {
          if (!afford(s, TYPES[b.dataset.build].cost)) {
            toast('Ehhez az épülethez még nincs elég nyersanyagod.');
            return;
          }
          moving = null;
          chosen = b.dataset.build;
          setSheet(false);
          render();
          toast('Érints egy üres füves helyet.');
        }),
    );
  } else {
    $('panel').innerHTML = QUESTS.map(
      (q) =>
        `<div class="quest ${s.claimed.includes(q.id) ? 'done' : ''}"><div><b>${q.title}</b><p>${q.text}<br>${cost(q.reward)}</p></div><button data-claim="${q.id}" ${s.claimed.includes(q.id) || !q.test(s) ? 'disabled' : ''}>${s.claimed.includes(q.id) ? 'Kész ✓' : q.test(s) ? 'Átveszem' : 'Folyamatban'}</button></div>`,
    ).join('');
    document.querySelectorAll('[data-claim]').forEach(
      (b) =>
        (b.onclick = () => {
          if (claim(s, b.dataset.claim)) {
            save();
            render();
            toast('Jutalom átvéve.');
          }
        }),
    );
  }
}
const canvas = $('map');
const renderer = createRenderer(
  canvas,
  () => s,
  () => selected,
  camera,
  {
    update: updateHero,
    isMoving: () => heroPath.length > 0,
    destination: () => heroPath.at(-1),
    harvestTarget: () => gatherTarget,
    buildMode: () =>
      chosen
        ? { type: chosen }
        : moving !== null
          ? { type: s.buildings[moving]?.type, ignoreId: s.buildings[moving]?.id }
          : null,
    onReady: () => {
      $('loading').hidden = true;
    },
    onError: (e) => {
      $('loading').textContent =
        'A grafika betöltése nem sikerült. Nyisd meg újra internet mellett. ' + e.message;
    },
  },
);
function draw() {
  renderer.draw(performance.now());
}
function startWalk(target, collect = false) {
  if (!regionUnlocked(s, target.x, target.y)) {
    toast('Az északi szigethez előbb építs favágótelepet és kőbányát.');
    return false;
  }
  const node = collect ? resourceTarget(s, target.x, target.y, target.resourceId) : null;
  if (collect && !node) {
    toast('Ezt a nyersanyagot már kitermelted.');
    return false;
  }
  const raw = findPath(s, s.hero, { x: Math.round(target.x), y: Math.round(target.y) }),
    path = node ? resourcePath(s, s.hero, node) : smoothPath(s, s.hero, raw, target.precise);
  if (!path) {
    toast('Erre most nincs járható út. Próbálj egy közeli tisztást.');
    return false;
  }
  heroPath = path;
  gatherTarget = node ? { ...target, resourceId: node.id } : null;
  gatherWait = 0;
  gatherHits = 0;
  gatherAmount = 0;
  nextImpact = 0.17;
  camera.follow = true;
  selected = null;
  detail();
  return true;
}
function updateHero(dt) {
  updateWorkers(s, dt);
  s.hero.action = heroPath.length ? 'walk' : 'idle';
  if (heroPath.length) s.hero.workTime = 0;
  if (heroPath.length) {
    const next = heroPath[0];
    if (!walkable(s, Math.round(next.x), Math.round(next.y))) {
      heroPath = [];
      gatherTarget = null;
      toast('Az út közben megváltozott. Válassz új célt.');
    } else advanceHero(s, heroPath, dt);
  }
  const cell = key(Math.round(s.hero.x), Math.round(s.hero.y));
  if (cell !== lastReveal) {
    lastReveal = cell;
    const amount = revealAround(s, s.hero, 2.8);
    if (amount) {
      panel();
      save();
    }
  }
  if (!heroPath.length && gatherTarget) {
    const node = resourceTarget(s, gatherTarget.x, gatherTarget.y, gatherTarget.resourceId);
    if (!node) {
      gatherTarget = null;
      s.hero.action = 'idle';
    } else {
      s.hero.action = node.kind === 'wood' ? 'chop' : 'mine';
      s.hero.targetAngle = Math.atan2(-(node.x - s.hero.x), node.y - s.hero.y);
      gatherWait += dt;
      s.hero.workTime = gatherWait;
      while (gatherTarget && gatherWait >= nextImpact) {
        const result = harvestHit(s, gatherTarget);
        if (result.ok) {
          gatherHits++;
          gatherAmount += result.amount;
        }
        nextImpact += 0.966667;
        if (!result.ok || result.finished || gatherHits >= 3) {
          gatherTarget = null;
          s.hero.action = 'idle';
          s.hero.workTime = 0;
          if (result.ok) {
            save();
            render(false);
            toast(`+${gatherAmount} ${RES[result.kind][1].toLowerCase()} a készletben`);
          }
        }
      }
    }
  }
  const desired = Number.isFinite(s.hero.targetAngle) ? s.hero.targetAngle : 0,
    current = Number.isFinite(s.hero.angle) ? s.hero.angle : desired;
  const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  s.hero.angle = current + difference * (1 - Math.exp(-dt * 12));
  if (camera.follow) {
    const a = 1 - Math.exp(-dt * 6);
    camera.focus.x += (s.hero.x - camera.focus.x) * a;
    camera.focus.y += (s.hero.y - camera.focus.y) * a;
    camera.x *= 1 - a;
    camera.y *= 1 - a;
  }
}
function setSheet(open) {
  sheetOpen = open;
  $('sheet').hidden = !open;
  document.querySelectorAll('[data-tab]').forEach((b) => {
    const active = open && b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-expanded', String(active));
  });
  if (open) {
    $('sheettitle').textContent = { build: 'Építkezés', quests: 'Küldetések' }[tab];
    panel();
  }
}
$('closesheet').onclick = () => setSheet(false);
attachGestures(canvas, camera, {
  change: () => {
    camera.follow = false;
    draw();
  },
  tap: ({ x, y }) => {
    if (sheetOpen) {
      setSheet(false);
      return;
    }
    const groundPoint = renderer.worldPoint({ x, y });
    const hit =
      chosen || moving !== null
        ? { x: Math.round(groundPoint.x), y: Math.round(groundPoint.y) }
        : renderer.hit({ x, y });
    if (hit && (hit.x < 0 || hit.y < 0 || hit.x >= SIZE || hit.y >= SIZE)) return;
    if (hit) {
      const b = s.buildings.find((q) => q.x === hit.x && q.y === hit.y),
        t = terrainAt(s, hit.x, hit.y);
      if (chosen || moving !== null) {
        selected = hit;
        render();
        return;
      }
      if (b) {
        selected = hit;
        render();
        return;
      }
      selected = null;
      startWalk(
        { ...hit, precise: t === 'grass' ? renderer.worldPoint({ x, y }) : undefined },
        t === 'forest' || t === 'mountain',
      );
      render();
    }
  },
});
$('nextgoal').onclick = () => {
  tab = 'quests';
  setSheet(true);
};
document.querySelectorAll('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      const same = tab === b.dataset.tab;
      tab = b.dataset.tab;
      setSheet(!sheetOpen || !same);
    }),
);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setSheet(false);
});
function openSettings() {
  $('saveinfo').textContent =
    `Játékverzió: 0.7 · Mentés: v${s.version}. ${saveOK ? 'Automatikus mentés aktív.' : 'A sérült mentés védelme miatt az automatikus mentés leállt. Érvényes importtal újraindítható.'}`;
  $('modal').showModal();
}
$('settings').onclick = openSettings;
$('close').onclick = () => $('modal').close();
$('export').onclick = () => {
  settle();
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `szigetkert-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
$('import').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 4000000) throw Error('Túl nagy mentésfájl.');
    const candidate = importGame(await f.text());
    if (!confirm('Az import lecseréli a jelenlegi szigetedet. Folytatod?')) return;
    s = candidate;
    const seconds = tick(s, Date.now(), false);
    produceOfflineWorkers(s, seconds);
    saveOK = true;
    moving = null;
    chosen = null;
    selected = null;
    heroPath = [];
    gatherTarget = null;
    camera.focus = { x: s.hero.x, y: s.hero.y };
    camera.follow = true;
    save();
    render();
    $('modal').close();
    toast('A szigeted megérkezett.');
  } catch (err) {
    toast(err.message);
  } finally {
    e.target.value = '';
  }
};
window.addEventListener('resize', draw);
document.addEventListener('visibilitychange', () => {
  settle();
  previouslyHidden = document.hidden;
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
  render(false);
  save();
}, 2000);
render();
if (offline)
  setTimeout(() => toast(`${Math.floor(elapsed / 60)} perc távolléti termelés jóváírva.`), 500);
setupOffline({ save, toast });
