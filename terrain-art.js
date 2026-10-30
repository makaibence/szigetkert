import { SIZE, terrain, noise } from './world.js';
const TEX = 2300,
  SCALE = 50,
  OFFSET = 2;
const canvas = () => {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  return c;
};
export class TerrainSurface {
  constructor(meadow) {
    this.land = canvas();
    this.create(meadow);
  }
  create(meadow) {
    // Blur and threshold a continuous occupancy field: no individually outlined shore tiles.
    const raw = canvas(),
      r = raw.getContext('2d');
    r.fillStyle = 'white';
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        if (terrain(x, y) !== 'water')
          r.fillRect(
            (x + OFFSET - 0.53) * SCALE,
            (y + OFFSET - 0.53) * SCALE,
            SCALE * 1.06,
            SCALE * 1.06,
          );
    const blurred = canvas(),
      b = blurred.getContext('2d', { willReadFrequently: true });
    b.filter = 'blur(25px)';
    b.drawImage(raw, 0, 0);
    b.filter = 'none';
    const values = b.getImageData(0, 0, TEX, TEX).data,
      alpha = new Uint8Array(TEX * TEX);
    for (let i = 0; i < alpha.length; i++) alpha[i] = values[i * 4 + 3];
    const makeMask = (threshold) => {
      const c = canvas(),
        ctx = c.getContext('2d'),
        data = ctx.createImageData(TEX, TEX);
      for (let i = 0; i < alpha.length; i++) {
        data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = 255;
        data.data[i * 4 + 3] = Math.min(255, Math.max(0, (alpha[i] - threshold) * 16));
      }
      ctx.putImageData(data, 0, 0);
      return c;
    };
    this.sandMask = makeMask(90);
    this.grassMask = makeMask(166);
    this.foam = makeMask(55);
    const foam = this.foam.getContext('2d');
    foam.globalCompositeOperation = 'destination-out';
    foam.drawImage(this.sandMask, 0, 0);
    const l = this.land.getContext('2d');
    l.drawImage(this.sandMask, 0, 0);
    l.globalCompositeOperation = 'source-in';
    l.fillStyle = '#e4c594';
    l.fillRect(0, 0, TEX, TEX);
    l.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 20000; i++) {
      l.fillStyle = i % 2 ? '#b69e6b28' : '#fff0c32c';
      l.fillRect(noise(i, 11) * TEX, noise(i, 12) * TEX, 1 + noise(i, 13) * 2, 1);
    }
    const grass = canvas(),
      g = grass.getContext('2d');
    g.fillStyle = '#9ab85c';
    g.fillRect(0, 0, TEX, TEX);
    // The painted detail is repeated at a material scale, not as visible square terrain tiles.
    const repeat = 420;
    for (let y = 0; y < TEX; y += repeat)
      for (let x = 0; x < TEX; x += repeat) g.drawImage(meadow, x, y, repeat, repeat);
    g.globalAlpha = 0.26;
    g.fillStyle = '#b6bd68';
    g.fillRect(0, 0, TEX, TEX);
    g.globalAlpha = 1;
    for (let i = 0; i < 240; i++) {
      const x = noise(i, 1) * TEX,
        y = noise(i, 2) * TEX,
        r = 35 + noise(i, 3) * 95;
      const patch = g.createRadialGradient(x, y, 0, x, y, r);
      patch.addColorStop(0, i % 3 ? '#d6cd7750' : '#355f453b');
      patch.addColorStop(1, '#7eab4900');
      g.fillStyle = patch;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // A lightly worn clearing around the initial camp, with an irregular edge.
    const cx = (5 + OFFSET) * SCALE,
      cy = (5 + OFFSET) * SCALE;
    const clearing = g.createRadialGradient(cx, cy, 5, cx, cy, 105);
    clearing.addColorStop(0, '#d9c48dc9');
    clearing.addColorStop(0.55, '#cbb87a78');
    clearing.addColorStop(1, '#b9bd6b00');
    g.fillStyle = clearing;
    g.fillRect(cx - 105, cy - 105, 210, 210);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(this.grassMask, 0, 0);
    g.globalCompositeOperation = 'source-over';
    l.globalCompositeOperation = 'source-over';
    l.drawImage(grass, 0, 0);
    // Preserve only the composed surface after startup to keep mobile memory bounded.
    const shallow = makeMask(25),
      sh = shallow.getContext('2d');
    sh.globalCompositeOperation = 'source-in';
    sh.fillStyle = '#67c8b8';
    sh.fillRect(0, 0, TEX, TEX);
    l.globalCompositeOperation = 'destination-over';
    l.drawImage(shallow, 0, 0);
    l.globalCompositeOperation = 'source-over';
    raw.width =
      blurred.width =
      grass.width =
      shallow.width =
      this.sandMask.width =
      this.grassMask.width =
        1;
  }
  draw(ctx, projectGround) {
    ctx.save();
    projectGround();
    ctx.shadowColor = '#164f68a0';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 0.13;
    ctx.drawImage(this.land, -OFFSET, -OFFSET, TEX / SCALE, TEX / SCALE);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  drawShore(ctx, projectGround, now) {
    ctx.save();
    projectGround();
    ctx.globalAlpha = 0.3 + Math.sin(now / 1800) * 0.06;
    // A narrow foam glow uses the same smooth coastline as the sand, so it cannot form a tile grid.
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = '#e1f8e4';
    ctx.shadowBlur = 8;
    ctx.drawImage(this.foam, -OFFSET, -OFFSET, TEX / SCALE, TEX / SCALE);
    ctx.restore();
  }
}
