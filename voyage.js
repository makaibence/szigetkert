import { PROJECTS, HOME_SHORE, ECHO_SITES, RIGGING_ORDER } from './voyage-content.js';
import { canPay, payMaterials } from './production.js';
const copy = (x) => JSON.parse(JSON.stringify(x));
export const voyageReady = (s) =>
  !!s.voyage && !!s.chapter?.completedOrders.includes('mason-sample');
export const projectDone = (s, id) => !!s.voyage?.completed.includes(id);
export function ensureVoyage(s) {
  if (s.adventure?.kind !== 'story' || ![4, 5].includes(s.worldVersion)) return;
  if (!s.voyage)
    s.voyage = {
      revision: 1,
      currentIsland: 'home',
      homeLevel: 1,
      completed: [],
      diaryRead: false,
      harbourSeen: false,
      noteRead: false,
      shipwrightMet: false,
      riggingOwned: false,
      keeperMet: false,
      signalRead: false,
      beaconLit: false,
      returned: false,
      gateOpen: false,
      variant: s.adventure.seed % 3,
      levers: [0, 2, 0],
      hint: 0,
      job: null,
      travel: null,
      worlds: { home: null, echo: null },
    };
  if (s.voyage.currentIsland === 'home' && s.voyage.diaryRead)
    for (const p of HOME_SHORE)
      if (!s.adventure.sites.some((q) => q.id === p.id))
        s.adventure.sites.push({
          ...copy(p),
          restored: false,
          inspected: false,
          noticeAccepted: false,
        });
}
export function voyageSite(s, p) {
  return !!s.voyage && (!!p?.voyageRole || (p?.type === 'hut' && voyageReady(s)));
}
export function nearVoyageSite(s, id) {
  const p = s.adventure.sites.find((p) => p.id === id);
  return (
    !!p && s.revealed.includes(p.x + ',' + p.y) && Math.hypot(s.hero.x - p.x, s.hero.y - p.y) <= 1.8
  );
}
export function projectAllowed(s, id) {
  if (!voyageReady(s) || projectDone(s, id)) return false;
  const v = s.voyage,
    has = (id) => projectDone(s, id);
  const rules = {
    'home-roof': v.currentIsland === 'home',
    'home-floor': has('home-roof'),
    pier: v.diaryRead && v.harbourSeen,
    winch: has('pier') && v.shipwrightMet,
    'boat-hull': has('winch') && v.gateOpen,
    'boat-mast': has('boat-hull'),
    'boat-rudder': has('boat-mast'),
    'boat-rigging': has('boat-rudder') && v.riggingOwned,
    'echo-repair': v.currentIsland === 'echo' && v.keeperMet,
    'echo-beacon': has('echo-repair') && v.signalRead,
    'home-living': v.currentIsland === 'home' && v.returned && v.beaconLit,
    'home-courtyard': has('home-living'),
  };
  return !!rules[id];
}
export function startProject(s, id) {
  const p = PROJECTS[id];
  if (
    !p ||
    s.voyage?.job ||
    !projectAllowed(s, id) ||
    !nearVoyageSite(s, p.site) ||
    !canPay(s, p.cost)
  )
    return false;
  payMaterials(s, p.cost);
  s.voyage.job = { id, site: p.site, total: p.seconds, remaining: p.seconds };
  return true;
}
export function advanceVoyage(s, seconds) {
  const v = s.voyage,
    j = v?.job;
  if (!j || seconds <= 0) return;
  j.remaining = Math.max(0, j.remaining - seconds);
  if (!j.remaining) {
    if (!v.completed.includes(j.id)) {
      v.completed.push(j.id);
      const p = PROJECTS[j.id];
      if (p.level) v.homeLevel = p.level;
      if (j.id === 'echo-beacon') {
        v.beaconLit = true;
        s.resources.silver += 8;
      }
      const site =
        s.adventure?.sites.find((p) => p.id === j.site) ||
        Object.values(v.worlds || {})
          .flatMap((world) => world?.adventure?.sites || [])
          .find((p) => p.id === j.site);
      if (site?.voyageRole) site.restored = true;
    }
    v.job = null;
  }
}
export function readVoyageDiary(s) {
  if (!projectDone(s, 'home-floor') || !nearVoyageSite(s, 'camp')) return false;
  s.voyage.diaryRead = true;
  ensureVoyage(s);
  return true;
}
export function inspectVoyageSite(s, id) {
  if (!nearVoyageSite(s, id)) return false;
  const p = s.adventure.sites.find((p) => p.id === id),
    v = s.voyage;
  if (!v || !p.voyageRole) return false;
  p.inspected = true;
  p.noticeAccepted = true;
  if (id === 'harbour') {
    v.harbourSeen = true;
    v.shipwrightMet = true;
    s.chapter.advancedUnlocked = true;
  }
  if (id === 'pier-note') v.noteRead = true;
  if (id === 'echo-home') v.keeperMet = true;
  if (id === 'echo-beacon') v.signalRead = true;
  return true;
}
export function deliverRigging(s) {
  const v = s.voyage;
  if (
    !v ||
    v.riggingOwned ||
    !projectDone(s, 'boat-hull') ||
    !nearVoyageSite(s, 'tradepost') ||
    !canPay(s, RIGGING_ORDER.cost)
  )
    return false;
  payMaterials(s, RIGGING_ORDER.cost);
  v.riggingOwned = true;
  return true;
}
export function turnLever(s, index) {
  const v = s.voyage;
  if (
    !v ||
    v.gateOpen ||
    !projectDone(s, 'winch') ||
    !nearVoyageSite(s, 'harbour') ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 2
  )
    return false;
  v.levers[index] = (v.levers[index] + 1) % (index === 2 ? 2 : 3);
  return true;
}
export function testGate(s) {
  const v = s.voyage;
  if (!v || v.gateOpen || !projectDone(s, 'winch') || !nearVoyageSite(s, 'harbour')) return false;
  const [l, r, latch] = v.levers;
  if (l === v.variant && r === v.variant && latch === 1) {
    v.gateOpen = true;
    return true;
  }
  return false;
}
export function puzzleHint(s) {
  const v = s.voyage;
  if (!v || !projectDone(s, 'winch') || !nearVoyageSite(s, 'harbour')) return '';
  v.hint = Math.min(3, v.hint + 1);
  return v.hint === 1
    ? 'A kőbe vésett jel a bal ellensúly helyét mutatja. A hajóács feljegyzése a jobb oldallal foglalkozik.'
    : v.hint === 2
      ? `Bal oldalon ${[2, 4, 6][v.variant]} egységnyi súly kell. Jobbra eggyel könnyebb súlyt használtak.`
      : `Balra ${[2, 4, 6][v.variant]}, jobbra ${[1, 3, 5][v.variant]} egység kell, majd engedd ki a reteszt. A próbálkozások nem fogyasztanak anyagot.`;
}
export function voyageTask(s) {
  if (!voyageReady(s)) return null;
  const v = s.voyage,
    d = (id) => projectDone(s, id),
    task = (title, text, target, needs) => ({ title, text, target, needs });
  if (v.job) {
    const p = PROJECTS[v.job.id];
    return task(
      p.title,
      'A munka folyamatban van. Szabadon felfedezhetsz vagy bezárhatod a játékot, a megkezdett javítás megmarad.',
      p.site,
    );
  }
  if (v.currentIsland === 'echo') {
    if (!v.keeperMet)
      return task(
        'Van itt valaki?',
        'A parti ösvény egy régi ház felé vezet. Nézd meg, lakik-e itt valaki.',
        'echo-home',
      );
    if (!d('echo-repair'))
      return task(
        'Menedék az öbölőrnek',
        'Az öbölőr házának javításával többet megtudhatsz a régi hajóútról.',
        'echo-home',
        PROJECTS['echo-repair'].cost,
      );
    if (!v.signalRead)
      return task(
        'A néma jelző',
        'Az öbölőr egy elnémult parti jelzőt említett. Keresd meg az ösvényen.',
        'echo-beacon',
      );
    if (!v.beaconLit)
      return task(
        'Újra fény az öbölben',
        'Javítsd meg a parti jelző lámpatartóját.',
        'echo-beacon',
        PROJECTS['echo-beacon'].cost,
      );
    return task(
      'Van hová hazatérni',
      'Az öbölőr rád bízta a napló hiányzó lapját. Térj vissza a hajódhoz, és indulj haza.',
      'echo-landing',
    );
  }
  if (!d('home-roof'))
    return task(
      'A ház, ami hazavár',
      'Az ács a bázisodból a saját otthonodat alakíthatja ki. Beszélj vele a tető rendbetételéről.',
      'camp',
      PROJECTS['home-roof'].cost,
    );
  if (!d('home-floor'))
    return task(
      'A régi padló alatt',
      'Folytasd a ház felújítását a padlóval.',
      'camp',
      PROJECTS['home-floor'].cost,
    );
  if (!v.diaryRead)
    return task(
      'Valami a gerendák között',
      'A padló alól egy régi hajónapló került elő. Nézd meg otthon.',
      'camp',
    );
  if (!v.harbourSeen)
    return task(
      'A napló kikötője',
      'A rajzon egy régi parti rakodó látszik. Kutasd át a bázis mögötti partvidéket.',
      'harbour',
    );
  if (!d('pier'))
    return task(
      'A régi kikötő',
      'Segíts a hajóácsnak helyreállítani a stéget.',
      'harbour',
      PROJECTS.pier.cost,
    );
  if (!d('winch')) {
    if (s.resources.iron < 2) {
      if (!s.buildings.some((b) => b.type === 'kiln'))
        return task(
          'A hajóemelő tengelye',
          'A csörlőhöz vas kell. A régi szénégetőből tüzelőt szerezhetsz a kovácsműhelynek.',
          'kiln',
        );
      if (!s.buildings.some((b) => b.type === 'forge'))
        return task(
          'A kovács műhelye',
          'Hozd működésbe a kovácsműhelyt a csörlő vastengelyéhez.',
          'forge',
        );
      return task(
        'Vas a csörlőhöz',
        'Fejts vasércet, készíts faszenet, majd két vasat a kovácsműhelyben.',
        'forge',
      );
    }
    return task(
      'A csörlő új tengelye',
      'A vastengellyel újra működésbe hozható a kikötő emelője.',
      'harbour',
      PROJECTS.winch.cost,
    );
  }
  if (!v.gateOpen)
    return task(
      'Az ellensúlyos kapu',
      'A kikötő kövén és a hajóács feljegyzésén találod a kapu működésének nyomait.',
      'harbour',
    );
  if (!d('boat-hull'))
    return task(
      'Még menthető',
      'A csörlővel kiemelt hajótest javítható. Kezdj hozzá a palánkokhoz.',
      'drydock',
      PROJECTS['boat-hull'].cost,
    );
  if (!d('boat-mast'))
    return task(
      'Árbóc a fedélzeten',
      'Készíttesd el a hajó új árbócát.',
      'drydock',
      PROJECTS['boat-mast'].cost,
    );
  if (!d('boat-rudder'))
    return task(
      'A hajó kormánya',
      'Rögzítsd az új kormánylapátot és a vasalatot.',
      'drydock',
      PROJECTS['boat-rudder'].cost,
    );
  if (!v.riggingOwned)
    return task(
      'Vitorla a raktárból',
      'A kereskedő anyagért cserébe vitorlavásznat és kötélzetet adna a hajódhoz.',
      'tradepost',
      RIGGING_ORDER.cost,
    );
  if (!d('boat-rigging'))
    return task('Készen az indulásra', 'Szereltesd fel a vitorlát és a kötélzetet.', 'drydock');
  if (!v.returned)
    return task(
      'Az első új part',
      'A hajód elkészült. A kikötőből elindulhatsz a naplóban jelölt szigetre.',
      'harbour',
    );
  if (!d('home-living'))
    return task(
      'Otthon a parton',
      'A visszahozott naplólap megmutatta, mire használták a házat. Készítsd el a lakóteret és a tornácot.',
      'camp',
      PROJECTS['home-living'].cost,
    );
  if (!d('home-courtyard'))
    return task(
      'A ház, ami hazavár',
      'Az ács az udvart és a munkapadot is rendbe teheti.',
      'camp',
      PROJECTS['home-courtyard'].cost,
    );
  return task(
    'Otthon és új partok',
    'Az otthonod elkészült, és az első hajóút is megvan. A kikötőből bármikor visszatérhetsz Borostyán-szigetre.',
    'harbour',
  );
}
export function validateVoyage(s) {
  const v = s.voyage;
  if (!v) return;
  const bools = [
    'diaryRead',
    'harbourSeen',
    'noteRead',
    'shipwrightMet',
    'riggingOwned',
    'keeperMet',
    'signalRead',
    'beaconLit',
    'returned',
    'gateOpen',
  ];
  if (
    v.revision !== 1 ||
    !['home', 'echo'].includes(v.currentIsland) ||
    !Number.isInteger(v.homeLevel) ||
    v.homeLevel < 1 ||
    v.homeLevel > 5 ||
    !Array.isArray(v.completed) ||
    new Set(v.completed).size !== v.completed.length ||
    !v.completed.every((id) => PROJECTS[id]) ||
    !bools.every((k) => typeof v[k] === 'boolean') ||
    !Number.isInteger(v.variant) ||
    v.variant < 0 ||
    v.variant > 2 ||
    !Array.isArray(v.levers) ||
    v.levers.length !== 3 ||
    !v.levers.every((n, i) => Number.isInteger(n) && n >= 0 && n < (i === 2 ? 2 : 3)) ||
    !Number.isInteger(v.hint) ||
    v.hint < 0 ||
    v.hint > 3 ||
    !v.worlds ||
    typeof v.worlds !== 'object'
  )
    throw Error('Hibás hajózási fejezetmentés.');
  if (v.feedback != null && (typeof v.feedback !== 'string' || v.feedback.length > 600))
    throw Error('Hibás kikötői feljegyzés.');
  if (
    v.job &&
    (!PROJECTS[v.job.id] ||
      v.job.site !== PROJECTS[v.job.id].site ||
      v.completed.includes(v.job.id) ||
      v.job.total !== PROJECTS[v.job.id].seconds ||
      !Number.isFinite(v.job.remaining) ||
      v.job.remaining <= 0 ||
      v.job.remaining > v.job.total)
  )
    throw Error('Hibás helyreállítási munka.');
  if (
    v.travel &&
    (!['home', 'echo'].includes(v.travel.from) ||
      !['home', 'echo'].includes(v.travel.to) ||
      v.travel.from === v.travel.to ||
      v.travel.from !== v.currentIsland ||
      v.travel.total !== 3 ||
      !Number.isFinite(v.travel.elapsed) ||
      v.travel.elapsed < 0 ||
      v.travel.elapsed > 3 ||
      !projectDone(s, 'boat-rigging'))
  )
    throw Error('Hibás hajóút.');
  const has = (id) => v.completed.includes(id);
  const dependencies = {
    'home-floor': 'home-roof',
    winch: 'pier',
    'boat-hull': 'winch',
    'boat-mast': 'boat-hull',
    'boat-rudder': 'boat-mast',
    'boat-rigging': 'boat-rudder',
    'echo-beacon': 'echo-repair',
    'home-courtyard': 'home-living',
  };
  const expectedLevel = has('home-courtyard')
    ? 5
    : has('home-living')
      ? 4
      : has('home-floor')
        ? 3
        : has('home-roof')
          ? 2
          : 1;
  if (
    v.homeLevel !== expectedLevel ||
    Object.entries(dependencies).some(([id, required]) => has(id) && !has(required)) ||
    (v.diaryRead && !has('home-floor')) ||
    (v.gateOpen && !has('winch')) ||
    (has('boat-rigging') && !v.riggingOwned) ||
    v.beaconLit !== has('echo-beacon') ||
    (has('home-living') && !v.beaconLit)
  )
    throw Error('Hiányos hajózási előrehaladás.');
  if ((v.currentIsland === 'echo') !== (s.worldVersion === 5)) throw Error('Hibás aktív sziget.');
}
export function newEchoWorld(s, now) {
  return {
    worldVersion: 5,
    buildings: [],
    workers: [],
    production: { serial: 1, jobs: [], crews: {} },
    nextBuildingId: s.nextBuildingId,
    hero: { x: 3, y: 11, angle: 0, direction: 'se' },
    revealed: ['2,10', '2,11', '2,12', '3,10', '3,11', '3,12', '4,10', '4,11', '4,12'],
    resourceState: {},
    unlocked: ['starter', 'main'],
    last: now,
    adventure: {
      revision: 2,
      kind: 'story',
      seed: (s.adventure.seed ^ 0x54a12) >>> 0,
      introSeen: true,
      tutorialSeen: true,
      sites: ECHO_SITES.map((p) => ({
        ...copy(p),
        restored: false,
        inspected: false,
        noticeAccepted: false,
      })),
      items: {},
      decisions: [],
      eventsSeen: [],
      pending: null,
      nextEventAt: 999999,
      playTime: 0,
      nextForageAt: 0,
    },
  };
}
