import { PROJECTS, RIGGING_ORDER } from './voyage-content.js';
import {
  voyageSite,
  voyageReady,
  projectDone,
  projectAllowed,
  nearVoyageSite,
  startProject,
  readVoyageDiary,
  deliverRigging,
  turnLever,
  testGate,
  puzzleHint,
} from './voyage.js';
import { canPay, durationText } from './production.js';
import { materialAmounts } from './ui-icons.js';
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function button(id, label, disabled = false) {
  return `<button data-voyage-action="${id}" ${disabled ? 'disabled' : ''}>${label}</button>`;
}
export function voyagePanel(s, p, renderer) {
  const v = s.voyage;
  if (
    !v ||
    !(
      voyageSite(s, p) ||
      (voyageReady(s) && p.id === 'tradepost' && projectDone(s, 'boat-hull') && !v.riggingOwned)
    )
  )
    return null;
  if (!p.inspected && p.voyageRole) return null;
  let title = p.name,
    note = '',
    html = '';
  const near = nearVoyageSite(s, p.id),
    done = (id) => projectDone(s, id);
  const project = (id) => {
    const q = PROJECTS[id],
      active = v.job?.id === id;
    return `<section class="voyage-project"><h4>${esc(q.title)}</h4><p>${esc(q.text)}</p>${active ? `<p class="project-live">Folyamatban · kb. ${durationText(v.job.remaining)}</p><progress max="${v.job.total}" value="${v.job.total - v.job.remaining}"></progress>` : `${materialAmounts(q.cost, renderer, { available: s.resources })}<p class="hint">Javítás: kb. ${durationText(q.seconds)}. A megkezdett munka bezárás után is befejeződik.</p>${button('project:' + id, 'Javítás indítása', !near || !!v.job || !projectAllowed(s, id) || !canPay(s, q.cost))}`}</section>`;
  };
  if (!near)
    return {
      title,
      note: 'Menj közelebb, hogy beszélhess a helyszínen dolgozóval.',
      html: button('approach', 'Odamegyek'),
    };
  if (p.type === 'hut') {
    title = `Otthonod · ${v.homeLevel}. szint`;
    note = 'Közös készlet, találkozóhely és a saját otthonod. Nem termel nyersanyagot.';
    const index = v.homeLevel >= 5 ? 2 : v.homeLevel >= 4 ? 1 : 0,
      src = renderer.thumbnail('voyage', index, 240);
    html = `${v.homeLevel > 1 ? `<img class="voyage-picture" src="${src}" alt="A felújított otthonod">` : ''}`;
    if (!done('home-roof')) html += project('home-roof');
    else if (!done('home-floor')) html += project('home-floor');
    else if (!v.diaryRead)
      html += `<h4>Egy elázott hajónapló</h4><p>Az ács a gerendák közül egy vászonba csavart füzetet emelt ki.</p>${button('diary', 'Elolvasom a hajónaplót')}`;
    else if (!v.returned)
      html +=
        '<p>A napló egy közeli kikötőről és egy másik szigetről mesél. Az otthonod megvár, amíg utánajársz.</p>';
    else if (!done('home-living')) html += project('home-living');
    else if (!done('home-courtyard')) html += project('home-courtyard');
    else
      html +=
        '<h4>Van hová hazatérni</h4><p>Az otthonod elkészült. A kikötőből bármikor visszatérhetsz Borostyán-szigetre.</p>';
  } else if (p.voyageRole === 'harbour') {
    note = 'A hajóács itt dolgozik a régi emelőn. A stég, a csörlő és a kapu külön-külön újul meg.';
    html = `<div class="voyage-stages"><span>${done('pier') ? '✓' : '○'} Stég</span><span>${done('winch') ? '✓' : '○'} Csörlő</span><span>${v.gateOpen ? '✓' : '○'} Kapu</span></div>`;
    if (!done('pier')) html += project('pier');
    else if (!done('winch'))
      html +=
        project('winch') +
        '<p>A tengelyhez a kovácsműhelyben készíthetsz vasat, vasércből és faszénből.</p>';
    else if (!v.gateOpen) {
      const [l, r, latch] = v.levers;
      html += `<h4>Az ellensúlyos kapu</h4><p>A bal csiga jelét a kikötő kövén találod. A hajóács feljegyzése szerint jobbra eggyel könnyebb súlyt tettek, mint balra.</p><div class="gate-diagram ${latch ? 'released' : ''}" aria-label="Kikötői kapu, bal súly ${[2, 4, 6][l]}, jobb súly ${[1, 3, 5][r]}"><span class="gate-weight">${[2, 4, 6][l]}</span><span class="gate-door">${latch ? 'RETESZ SZABAD' : 'RETESZ ZÁRVA'}</span><span class="gate-weight">${[1, 3, 5][r]}</span></div><div class="lever-controls">${button('lever:0', 'Bal ellensúly: ' + [2, 4, 6][l])}${button('lever:1', 'Jobb ellensúly: ' + [1, 3, 5][r])}${button('lever:2', latch ? 'Retesz: kiengedve' : 'Retesz: rögzítve')}</div>${button('gate', 'Kipróbálom a kaput')}<p id="gate-feedback" role="status">${esc(v.feedback || '')}</p>${button('hint', 'Kérek egy nyomot')}<p class="hint">A beállítások mentődnek. A próbálkozás nem fogyaszt anyagot.</p>`;
    } else if (done('boat-rigging'))
      html += `<h4>A hajód útra kész</h4><p>${v.returned ? 'A már felfedezett szigetre szabadon visszatérhetsz.' : 'A napló rajzai Borostyán-szigethez vezetnek. A visszaút is bármikor elérhető lesz.'}</p>${button('sail:echo', 'Indulás Borostyán-szigetre')}`;
    else html += '<p>A kapu felemelkedett. A hajóács a közeli hajótestnél vár a javításhoz.</p>';
  } else if (p.voyageRole === 'boat') {
    note = done('boat-rigging')
      ? 'A saját hajód elkészült. A kikötőből indulhatsz útnak.'
      : 'A hajótörésből megmentett hajótest. A hajóács segít ismét vízre tenni.';
    const id = ['boat-hull', 'boat-mast', 'boat-rudder', 'boat-rigging'].find((id) => !done(id));
    if (id === 'boat-hull' && (!done('winch') || !v.gateOpen))
      html =
        '<p>Előbb állítsd helyre a kikötő csörlőjét, és nyisd ki az ellensúlyos kaput. Utána biztonságosan kiemelhető a hajótest.</p>';
    else if (id === 'boat-rigging' && !v.riggingOwned)
      html =
        '<p>A hajótest, árbóc és kormány kész. A kereskedő vitorlavásznat és kötélzetet adna egy anyagcsomagért.</p>';
    else if (id) html = project(id);
    else
      html = '<h4>Készen az indulásra</h4><p>A kikötőnél kiválaszthatod az első úti célodat.</p>';
  } else if (p.id === 'tradepost') {
    title = 'Vászon és kötélzet';
    note = RIGGING_ORDER.text;
    html =
      materialAmounts(RIGGING_ORDER.cost, renderer, { available: s.resources }) +
      '<p>Cserébe: vitorlavászon és teljes kötélzet a saját hajódhoz.</p>' +
      button('rigging', 'Átadom az anyagcsomagot', !canPay(s, RIGGING_ORDER.cost));
  } else if (p.voyageRole === 'note') {
    title = 'A kőbe vésett rajz';
    note = 'A kikötő régi mestere a megfelelő súlyt egy bemetszéssel jelölte.';
    html = `<div class="weight-rubbing" aria-label="Bal oldali ellensúly rajza">${[2, 4, 6].map((n, i) => `<span class="${i === v.variant ? 'marked' : ''}">${n}${i === v.variant ? ' ◇' : ''}</span>`).join('')}</div><p>A megjelölt súly a bal oldali csigához tartozik. A jobb oldalról a hajóács feljegyzése mesél.</p>`;
  } else if (p.voyageRole === 'landing') {
    note = 'A hajód a sekély öbölben vár. Az otthoni szigeted és készleted megmaradt.';
    html = `<img class="voyage-picture boat-picture" src="${renderer.thumbnail('voyage', 7, 240)}" alt="A saját vitorlásod">${button('sail:home', 'Hazahajózom')}`;
  } else if (p.voyageRole === 'keeper') {
    title = 'Az öbölőr háza';
    note =
      'Az öbölőr a vihar óta egyedül vigyáz a régi hajóútra. A háza és a parti jelző is megsérült.';
    html = !done('echo-repair')
      ? project('echo-repair')
      : '<p>„A naplód gazdáját ismertem. Nem elmenekültünk innen: a vihar után egymásnak mutattuk az utat. Keresd meg a parti jelzőmet, és újra lesz fény az öbölben.”</p>';
  } else if (p.voyageRole === 'beacon') {
    note = v.beaconLit
      ? 'A jelző újra fényt ad a régi hajóútnak.'
      : 'A régi jelző lámpatartója eltört. A füzetben ugyanaz a jel áll, mint a hajónaplóban.';
    html = !done('echo-repair')
      ? '<p>Előbb segíts rendbe hozni az öbölőr házát. Ő ismeri a jelző szerkezetét.</p>'
      : !v.beaconLit
        ? project('echo-beacon')
        : '<h4>A napló hiányzó lapja</h4><p>Az öbölőr rád bízza a lapot és a régi útvonal rajzát. Most már tudod, miért őrizték itt a fényt. Otthon folytathatod a házad rendbetételét.</p>';
  }
  return { title, note, html: `<div class="voyage-body">${html}</div>` };
}
export function applyVoyageAction(s, p, key) {
  if (key.startsWith('project:')) return { ok: startProject(s, key.slice(8)) };
  if (key === 'rigging') return { ok: deliverRigging(s) };
  if (key.startsWith('lever:')) return { ok: turnLever(s, Number(key.slice(6))) };
  if (key === 'gate') {
    const ok = testGate(s);
    return {
      ok: true,
      feedback: ok
        ? 'A retesz enged, a kapu lassan felemelkedik.'
        : 'A kötelek megfeszülnek, de a kapu nem emelkedik. Nézd meg az ellensúlyokat és a reteszt.',
    };
  }
  if (key === 'hint') return { ok: true, feedback: puzzleHint(s) };
  return { ok: false };
}
