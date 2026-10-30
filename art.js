export const ART_VERSION = 'painted-island-1';
export async function loadArt() {
  const manifest = await fetch('./assets/frames.json').then((r) => {
    if (!r.ok) throw Error('Grafikai leírás hiányzik.');
    return r.json();
  });
  const load = (src) =>
    new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(Error('Nem tölthető be: ' + src));
      i.src = src;
    });
  const [village, nature, meadow, props] = await Promise.all([
    load(manifest.village.src),
    load(manifest.nature.src),
    load('./assets/meadow.png'),
    load(manifest.props.src),
  ]);
  const pixels = {};
  for (const [name, img] of Object.entries({ village, nature, props })) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    pixels[name] = ctx.getImageData(0, 0, c.width, c.height).data;
  }
  return { village, nature, meadow, props, manifest, pixels };
}
