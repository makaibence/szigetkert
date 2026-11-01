// Stable IDs and story data are independent of the sprite atlas.
export const HOME_SHORE = [
  { id: 'harbour', kind: 'landmark', voyageRole: 'harbour', x: 8, y: 15, name: 'A régi kikötő' },
  { id: 'drydock', kind: 'landmark', voyageRole: 'boat', x: 10, y: 15, name: 'A megmentett hajó' },
  {
    id: 'pier-note',
    kind: 'landmark',
    voyageRole: 'note',
    x: 6,
    y: 14,
    name: 'Jelek a kikötő kövén',
  },
];
export const ECHO_SITES = [
  {
    id: 'echo-landing',
    kind: 'landmark',
    voyageRole: 'landing',
    x: 3,
    y: 11,
    name: 'Borostyán-sziget partja',
  },
  { id: 'echo-home', kind: 'landmark', voyageRole: 'keeper', x: 8, y: 10, name: 'Az öbölőr háza' },
  {
    id: 'echo-beacon',
    kind: 'landmark',
    voyageRole: 'beacon',
    x: 12,
    y: 7,
    name: 'A néma parti jelző',
  },
];
export const VOYAGE_TRAIL = [
  [
    [5, 10],
    [5, 13],
    [8, 14],
    [8, 15],
  ],
  [
    [8, 14],
    [10, 14],
    [10, 15],
  ],
  [
    [5, 13],
    [6, 14],
  ],
];
export const ECHO_TRAILS = [
  [
    [3, 11],
    [5, 11],
    [8, 10],
    [10, 9],
    [12, 7],
  ],
];
export const PROJECTS = {
  'home-roof': {
    site: 'camp',
    title: 'Új tető a házadra',
    text: 'Az ács újradeszkázza a tetőt és kijavítja a falat. Ez a ház már a te otthonod lesz.',
    cost: { planks: 8, stone: 18, silver: 4 },
    seconds: 18,
    level: 2,
  },
  'home-floor': {
    site: 'camp',
    title: 'A régi padló alatt',
    text: 'A korhadt padlót újra cserélitek. Az egyik gerenda alatt valami koppan.',
    cost: { planks: 10, cutStone: 4 },
    seconds: 20,
    level: 3,
  },
  pier: {
    site: 'harbour',
    title: 'A stég helyreállítása',
    text: 'A hajóács új járófelületet és erős kőtalpat készít. A csörlő még külön javításra vár.',
    cost: { planks: 12, cutStone: 6 },
    seconds: 22,
  },
  winch: {
    site: 'harbour',
    title: 'Új tengely a csörlőbe',
    text: 'A kovácsolt tengely és az új vezetősín ismét mozgásba hozza a hajóemelőt.',
    cost: { iron: 2, planks: 4 },
    seconds: 18,
  },
  'boat-hull': {
    site: 'drydock',
    title: 'A hajótest javítása',
    text: 'A fennakadt hajó törzsét a műhelyben megerősítik, majd új palánkokat kap.',
    cost: { planks: 14, stone: 6 },
    seconds: 24,
  },
  'boat-mast': {
    site: 'drydock',
    title: 'Árbóc a fedélzeten',
    text: 'Az új árbóc és fedélzeti támaszok a helyükre kerülnek.',
    cost: { planks: 8 },
    seconds: 18,
  },
  'boat-rudder': {
    site: 'drydock',
    title: 'Kormány és vasalat',
    text: 'Az új kormánylapátot a hajóács vasalattal rögzíti.',
    cost: { planks: 4, iron: 1 },
    seconds: 16,
  },
  'boat-rigging': {
    site: 'drydock',
    title: 'Vitorla és kötélzet',
    text: 'A kereskedőtől kapott vásznat és köteleket felszerelik. A hajó vízre kerül.',
    cost: {},
    seconds: 20,
  },
  'echo-repair': {
    site: 'echo-home',
    title: 'Menedék az öbölőrnek',
    text: 'Néhány új deszka és kő elég, hogy a ház ismét biztos menedék legyen.',
    cost: { planks: 6, stone: 8 },
    seconds: 18,
  },
  'echo-beacon': {
    site: 'echo-beacon',
    title: 'Fény az öböl felett',
    text: 'A jelző új állványt és lámpatartót kap. Innen már biztonságosan követhető a régi hajóút.',
    cost: { planks: 4, iron: 1 },
    seconds: 18,
  },
  'home-living': {
    site: 'camp',
    title: 'Otthon a parton',
    text: 'Az öbölőr útmutatása alapján lakóteret és fedett tornácot készít az ács.',
    cost: { planks: 10, cutStone: 8, silver: 8 },
    seconds: 22,
    level: 4,
  },
  'home-courtyard': {
    site: 'camp',
    title: 'A ház, ami hazavár',
    text: 'Kész lesz a rendezett udvar, a munkapad és a virágos bejárat. Már van hová hazatérned.',
    cost: { planks: 16, cutStone: 12, silver: 12 },
    seconds: 25,
    level: 5,
  },
};
export const RIGGING_ORDER = {
  id: 'voyage-rigging',
  title: 'Vászon a raktárból',
  text: 'A kereskedő javíttatja a parti raktárát. 30 fát és 6 faragott követ kér; cserébe a hajódhoz való vitorlavásznat és kötélzetet adja.',
  cost: { wood: 30, cutStone: 6 },
  site: 'tradepost',
};
