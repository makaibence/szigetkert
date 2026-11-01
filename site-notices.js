import { voyageNotice } from './voyage-present.js';
import { knownSite } from './adventure.js';

export function noticeEligible(p) {
  return !!p && (p.kind === 'bridge' || p.kind === 'building' || p.kind === 'landmark');
}
export function needsNotice(s, p) {
  return noticeEligible(p) && !p.restored && !p.noticeAccepted && knownSite(s, p);
}
export function nearbyNotices(s) {
  return s.adventure.sites.filter(
    (p) => needsNotice(s, p) && Math.hypot(s.hero.x - p.x, s.hero.y - p.y) <= 1.8,
  );
}
export function acknowledgeSiteNotice(s, id) {
  const p = s.adventure.sites.find((p) => p.id === id);
  if (!p || !needsNotice(s, p) || Math.hypot(s.hero.x - p.x, s.hero.y - p.y) > 1.8) return false;
  p.noticeAccepted = true;
  return true;
}
export function siteNotice(p, s) {
  if (p.voyageRole) return voyageNotice(s, p);
  if (p.kind === 'bridge')
    return {
      title: 'A leszakadt fahíd',
      text: 'Itt még nem tudsz átmenni. A gerendák leszakadtak, de az alapok tartanak. Odaát egy régi ösvény tűnik a ködbe. Vajon mit rejthet a túlpart?',
      button: 'Megnézem a javítást',
    };
  const notes = {
    hut: [
      'Egy hely, ahonnan elindulhatsz',
      'A régi ház régóta üres, de a tető még tart. Talán maradt odabent valami használható. Ez lehet az első biztos helyed a szigeten.',
      'Megnézem a házat',
    ],
    farm: [
      'Egy elvadult kert',
      'A gaz mögött gondosan kialakított ágyások rajzolódnak ki. Egy kis munkával újra élelmet adhatnának. A munkások ebből esznek pihenéskor: feltöltődik az energiájuk, és gyorsabban tudnak dolgozni.',
      'Megnézem a kertet',
    ],
    lumber: [
      'Nyomok az erdőben',
      'Farönkök között egy régi szerszámos kunyhóra bukkansz. Valaki egykor ebből az erdőből látta el a telepet.',
      'Megnézem a telepet',
    ],
    quarry: [
      'Kő a hegy oldalában',
      'A sziklafal tövében régi bányászeszközök hevernek. A lelőhely elhagyatott, de még sok használható követ rejthet.',
      'Megnézem a kőbányát',
    ],
    sawmill: [
      'A régi fűrészműhely',
      'A tető alatt munkapad és kézifűrész maradt. Ha kitakarítod, a farönkökből végre deszka készülhet.',
      'Megnézem a műhelyt',
    ],
    residence: [
      'Egy ács elhagyott háza',
      'A vihar megtépázta a tetőt. Az ajtón friss üzenet vár: „A parton láttam az új bázisodat. Ott kereslek majd. Az ács.”',
      'Elolvastam az üzenetet',
    ],
    mason: [
      'A kőfaragó műhelye',
      'Vésők és félig megmunkált kövek maradtak a műhelyben. Itt tartós építőanyag készülhetne a sziget következő javításaihoz.',
      'Megnézem a műhelyt',
    ],
    tradepost: [
      'A régi kereskedőudvar',
      'Az udvarban egy kereskedő rendezi a rakományát. Anyagra lenne szüksége a javításaihoz, és fizetne is érte.',
      'Megnézem az udvart',
    ],
  };
  const n = notes[p.type] || [
    p.name,
    'Egy elhagyott helyszín bukkant elő az ösvény mellett. Érdemes közelebbről megvizsgálni.',
    'Megvizsgálom',
  ];
  return { title: n[0], text: n[1], button: n[2] };
}
