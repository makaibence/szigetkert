/** State-aware narrative; independent of rendering, movement and save storage. */
export function carpenterSpeech(s) {
  const mill = s.buildings.find((b) => b.type === 'sawmill');
  const deal =
    '„A vihar megbontotta a házam tetejét. Ha hozol 3 deszkát és 8 követ, jobb munkapadot és vezetősínt készítek a régi fűrészműhelybe.”';
  if (!mill)
    return (
      deal +
      '\n\nElőbb keresd meg és tedd működőképessé a fűrészműhelyt. Ott elkészítheted a javításhoz szükséges deszkákat. Az ács ezután 2. szintre bővíti az alapműhelyt: 30%-kal több deszkát tud majd készíteni ugyanannyi idő alatt.'
    );
  if (mill.level >= 2)
    return (
      deal +
      '\n\nAz ács a házánál várja a javításhoz szükséges anyagokat. A már elért műhelyszinted megmarad; ő a munkapad és a vezetősín rendbetételét vállalja.'
    );
  return (
    deal +
    '\n\nAz ács a házánál várja az anyagot. A már működő, 1. szintű fűrészműhelyt 2. szintre bővíti: ugyanannyi idő alatt 30%-kal több deszkát készít.'
  );
}
export function restorationHint(s, p) {
  if (p.type === 'mason')
    return !s.chapter?.carpenterIntro
      ? 'Előbb beszélj az áccsal a bázisnál, majd segíts megjavítani a háza tetejét. Utána ő segít elindítani a kőfaragóműhelyt.'
      : 'Előbb add át a tetőjavításhoz kért deszkát és követ az ács házánál. A javítás után ő segít elindítani a kőfaragóműhelyt.';
  const required = s.adventure.sites.find((q) => q.id === p.requires || q.type === p.requires);
  return required
    ? 'Előbb ezt a helyet kell rendbe hoznod: ' + required.name + '.'
    : 'Előbb fejezd be a helyszínhez kapcsolódó feladatot.';
}
