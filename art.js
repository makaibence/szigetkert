export const ART_VERSION = 'painted-adventure-4';
export function validateArtManifest(manifest) {
  for (const [name, count] of Object.entries({
    village: 9,
    nature: 16,
    props: 9,
    expedition: 9,
    workshops: 9,
    items: 9,
    voyage: 9,
    closedDock: 1,
    beacon: 2,
  })) {
    const atlas = manifest?.[name];
    if (
      !atlas ||
      typeof atlas.src !== 'string' ||
      !Array.isArray(atlas.frames) ||
      atlas.frames.length < count
    )
      throw Error(
        'Régi vagy hiányos grafikai csomag. Töltsd fel az új assets mappa teljes tartalmát, az assets/frames.json fájllal együtt.',
      );
  }
  return manifest;
}
export async function loadArt() {
  const manifest = await fetch('./assets/frames.json')
    .then((r) => {
      if (!r.ok) throw Error('Grafikai leírás hiányzik.');
      return r.json();
    })
    .then(validateArtManifest);
  const load = (src) =>
    new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(Error('Nem tölthető be: ' + src));
      i.src = src;
    });
  const [village, nature, meadow, props, expedition, workshops, items, voyage, closedDock, beacon] =
    await Promise.all([
      load(manifest.village.src),
      load(manifest.nature.src),
      load('./assets/terrain-v08.png'),
      load(manifest.props.src),
      load(manifest.expedition.src),
      load(manifest.workshops.src),
      load(manifest.items.src),
      load(manifest.voyage.src),
      load(manifest.closedDock.src),
      load(manifest.beacon.src),
    ]);
  const pixels = {};
  for (const [name, img] of Object.entries({
    village,
    nature,
    props,
    expedition,
    workshops,
    items,
    voyage,
    closedDock,
    beacon,
  })) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    pixels[name] = ctx.getImageData(0, 0, c.width, c.height).data;
  }
  const frameImages = {},
    framePixels = {};
  for (const name of [
    'village',
    'nature',
    'props',
    'expedition',
    'workshops',
    'items',
    'voyage',
    'closedDock',
    'beacon',
  ]) {
    const source = {
      village,
      nature,
      props,
      expedition,
      workshops,
      items,
      voyage,
      closedDock,
      beacon,
    }[name];
    frameImages[name] = [];
    framePixels[name] = [];
    for (const [index, frame] of manifest[name].frames.entries()) {
      const [x, y, w, h] = frame,
        c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(source, x, y, w, h, 0, 0, w, h);
      const runs = manifest[name].masks?.[index];
      if (runs) {
        const mask = document.createElement('canvas');
        mask.width = w;
        mask.height = h;
        const m = mask.getContext('2d');
        m.fillStyle = '#fff';
        for (const [row, start, len] of runs) m.fillRect(start, row, len, 1);
        cx.globalCompositeOperation = 'destination-in';
        cx.drawImage(mask, 0, 0);
        cx.globalCompositeOperation = 'source-over';
      }
      frameImages[name].push(c);
      framePixels[name].push(cx.getImageData(0, 0, w, h).data);
    }
  }
  const materials = {};
  for (const [name, index] of [
    ['grass', 0],
    ['dirt', 1],
    ['sand', 2],
    ['forest', 3],
  ]) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    c.getContext('2d').drawImage(
      meadow,
      ((index % 2) * meadow.width) / 2,
      (Math.floor(index / 2) * meadow.height) / 2,
      meadow.width / 2,
      meadow.height / 2,
      0,
      0,
      512,
      512,
    );
    materials[name] = c;
  }
  return {
    village,
    nature,
    meadow,
    props,
    expedition,
    workshops,
    items,
    voyage,
    closedDock,
    beacon,
    materials,
    frameImages,
    framePixels,
    manifest,
    pixels,
  };
}

export function buildingFrame(type, level = 1) {
  return level >= 2
    ? { hut: 5, lumber: 6, quarry: 7, farm: 8, market: 4 }[type]
    : { hut: 0, lumber: 1, quarry: 2, farm: 3, market: 4 }[type];
}

export function buildingArt(type, level = 1) {
  if (type === 'sawmill') return { atlas: 'workshops', index: Math.min(2, level - 1) };
  if (type === 'mason') return { atlas: 'workshops', index: 3 + Math.min(2, level - 1) };
  if (['kiln', 'forge', 'residence'].includes(type))
    return { atlas: 'workshops', index: { kiln: 6, forge: 7, residence: 8 }[type] };
  if (type === 'tradepost') return { atlas: 'village', index: 4 };
  return { atlas: 'village', index: buildingFrame(type, level) };
}
