import { projectDone } from './voyage.js';
export function voyageNotice(s, p) {
  const v = s?.voyage;
  const cards = {
    harbour: [
      'A napló kikötője',
      'A gerendák közt egy hajóács rendezi a régi szerszámokat. „A roncsod törzse még menthető. Előbb a stég, a csörlő és ez a makacs kapu legyen újra rendben.”',
      'Beszélek a hajóáccsal',
    ],
    boat: [
      'Még menthető',
      'A hajótörésből megmentett hajótest a parton vár. Új palánkokkal, árbóccal és kormánnyal ismét eljuthatsz vele a közeli szigetekre.',
      'Megnézem a hajót',
    ],
    note: [
      'A kőbe vésett rajz',
      `A bal oldali csiga mellé három súlyt rajzoltak. A ${['legkisebb', 'középső', 'legnagyobb'][v?.variant || 0]} mellé külön bemetszés került. A jobb oldal rajzát lemosta a víz.`,
      'Megjegyzem a jelet',
    ],
    landing: [
      'Egy idegen part',
      'A hajód a sekély vízben ring. A fák között valami régi tető látszik, az ösvény arra vezet.',
      'Körülnézek',
    ],
    keeper: [
      'Az öbölőr',
      '„Régen több hajó járt erre. A vihar óta nincs fény a parti jelzőn, és a házamat is megtépázta a szél. A füzeted jelét ismerem.”',
      'Segítek az öbölőrnek',
    ],
    beacon: [
      'A néma parti jelző',
      'Az állványon egy törött lámpatartó lóg. A talapzat kövei közt megbúvó lapon ugyanaz a jel áll, mint a hajónaplóban.',
      'Megnézem a jelzőt',
    ],
  };
  const c = cards[p.voyageRole];
  return { title: c[0], text: c[1], button: c[2] };
}
export function voyageArt(s, p) {
  const v = s.voyage;
  if (!v) return null;
  if (p.type === 'hut' && v.homeLevel > 1)
    return { atlas: 'voyage', index: v.homeLevel >= 5 ? 2 : v.homeLevel >= 4 ? 1 : 0 };
  if (!p.voyageRole) return null;
  if (p.voyageRole === 'harbour')
    return {
      atlas: v.gateOpen || !projectDone(s, 'pier') ? 'voyage' : 'closedDock',
      index: v.gateOpen ? 4 : projectDone(s, 'pier') ? 0 : 3,
      scale: 1.85,
      dx: 0,
      dy: 0.6,
    };
  if (p.voyageRole === 'boat')
    return {
      atlas: 'voyage',
      index: projectDone(s, 'boat-rigging') ? 7 : projectDone(s, 'boat-hull') ? 6 : 5,
      scale: 1.9,
      dx: 0,
      dy: projectDone(s, 'boat-rigging') ? 1.6 : 0.75,
    };
  if (p.voyageRole === 'landing')
    return { atlas: 'voyage', index: 7, scale: 1.8, dx: -1.6, dy: 0.9 };
  if (p.voyageRole === 'keeper')
    return projectDone(s, 'echo-repair')
      ? { atlas: 'voyage', index: 0, scale: 1.4 }
      : { atlas: 'village', index: 0, scale: 1.4 };
  if (p.voyageRole === 'beacon') return { atlas: 'beacon', index: v.beaconLit ? 1 : 0, scale: 1.0 };
  return { atlas: 'nature', index: 9, scale: 0.55 };
}
