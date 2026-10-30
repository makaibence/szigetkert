import { TRAILS } from './island-layout.js';
import { SIZE, key, terrain, terrainAt, resourcesAt, noise } from './world.js';
import { placement } from './engine.js';
import { loadArt, buildingFrame } from './art.js';
import { TerrainSurface } from './terrain-art.js';
import { AvatarView } from './avatar-webgl.js';
const TEX = 2300,
  SCALE = 50,
  OFFSET = 2;

export function createRenderer(canvas, getState, getSelected, camera, options = {}) {
  const ctx = canvas.getContext('2d');
  let art,
    surface,
    avatar,
    ready = false,
    error = null,
    width = 0,
    height = 0,
    unit = 1,
    origin = { x: 0, y: 0 };
  let interactive = [],
    lastFrame = 0,
    frameCount = 0,
    fpsTime = 0;
  const fog = document.createElement('canvas');
  fog.width = fog.height = TEX;
  const cloud = document.createElement('canvas');
  cloud.width = cloud.height = 512;
  const cloudCtx = cloud.getContext('2d');
  cloudCtx.fillStyle = '#1d2a35';
  cloudCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 34; i++) {
    const x = noise(i, 4) * 512,
      y = noise(i, 5) * 512,
      r = 18 + noise(i, 6) * 80;
    for (const dx of [-512, 0, 512])
      for (const dy of [-512, 0, 512]) {
        const g = cloudCtx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, '#72818d39');
        g.addColorStop(1, '#72818d00');
        cloudCtx.fillStyle = g;
        cloudCtx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
  }
  const screenFog = document.createElement('canvas');
  let fogKey = '',
    revealStart = 0;
  const revealTimes = new Map();
  const load = async () => {
    try {
      avatar = new AvatarView();
      [art] = await Promise.all([loadArt(), avatar.ready]);
      surface = new TerrainSurface(art.materials, getState().worldVersion);
      ready = true;
      canvas.dataset.webgl = 'ready';
      options.onReady?.();
      draw(performance.now());
    } catch (e) {
      error = e;
      canvas.dataset.webgl = 'error';
      options.onError?.(e);
      console.error('Grafika betöltési hiba', e);
    }
  };
  const readyPromise = load();
  function pos(x, y) {
    return { x: origin.x + (x - y) * unit * 0.72, y: origin.y + (x + y - 10) * unit * 0.38 };
  }
  function ground(target = ctx) {
    target.transform(
      unit * 0.72,
      unit * 0.38,
      -unit * 0.72,
      unit * 0.38,
      origin.x,
      origin.y - unit * 3.8,
    );
  }
  function visible(p, margin = 2) {
    return (
      p.x > -unit * margin &&
      p.x < width + unit * margin &&
      p.y > -unit * margin &&
      p.y < height + unit * margin
    );
  }
  function sprite(atlas, index, p, w, hit, rotation = 0, alpha = 1) {
    const frame = art.manifest[atlas].frames[index],
      image = art[atlas];
    if (!frame) return;
    const [sx, sy, sw, sh] = frame,
      h = (w * sh) / sw,
      left = p.x - w / 2,
      top = p.y - h;
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (rotation) {
      ctx.translate(p.x, p.y);
      ctx.rotate(rotation);
      ctx.translate(-p.x, -p.y);
    }
    ctx.drawImage(art.frameImages[atlas][index], left, top, w, h);
    ctx.restore();
    if (hit && alpha > 0.9) interactive.push({ left, top, w, h, frame, atlas, index, tile: hit });
  }
  function updateFog(s, now) {
    const signature = s.revealed.join(';');
    if (signature !== fogKey) {
      for (const k of s.revealed)
        if (!revealTimes.has(k)) revealTimes.set(k, fogKey ? now : now - 1000);
      fogKey = signature;
      revealStart = now;
    }
    if (now - revealStart > 700 && fog.dataset.complete === signature) return;
    const f = fog.getContext('2d');
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, TEX, TEX);
    f.globalCompositeOperation = 'source-over';
    f.filter = 'blur(16px)';
    f.fillStyle = '#fff';
    for (const k of s.revealed) {
      const [x, y] = k.split(',').map(Number),
        age = Math.min(1, (now - revealTimes.get(k)) / 550);
      f.globalAlpha = age;
      f.beginPath();
      f.ellipse((x + OFFSET) * SCALE, (y + OFFSET) * SCALE, 43 + age * 10, 43 + age * 10, 0, 0, 7);
      f.fill();
    }
    f.globalAlpha = 1;
    f.filter = 'none';
    f.globalCompositeOperation = 'source-over';
    fog.dataset.complete = now - revealStart >= 550 ? signature : '';
  }
  function drawPaths(s) {
    ctx.save();
    ground();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let lines =
      s.worldVersion === 2
        ? TRAILS
        : s.buildings.slice(1).map((b, i) => {
            const parent = s.buildings
              .slice(0, i + 1)
              .sort(
                (a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y),
              )[0];
            return [
              [b.x, b.y + 0.4],
              [parent.x, parent.y + 0.4],
            ];
          });
    const pattern = ctx.createPattern(art.materials.dirt, 'repeat');
    pattern.setTransform(new DOMMatrix().scale(0.0035));
    for (const line of lines) {
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(...line[0]);
        for (let i = 1; i < line.length; i++) {
          const [ax, ay] = line[i - 1],
            [bx, by] = line[i],
            steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.1);
          for (let j = 1; j <= steps; j++) {
            const x = ax + ((bx - ax) * j) / steps,
              y = ay + ((by - ay) * j) / steps;
            if (terrain(Math.round(x), Math.round(y), s.worldVersion) === 'water') ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      };
      ctx.strokeStyle = '#89714333';
      ctx.lineWidth = 0.53;
      path();
      ctx.strokeStyle = pattern;
      ctx.lineWidth = 0.34;
      path();
    }
    for (const b of s.buildings) {
      ctx.fillStyle = pattern;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 0.1, 0.72, 0.63, 0, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }
  function draw(now = performance.now()) {
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    if (!width || !height) return;
    const pixelW = Math.round(width * dpr),
      pixelH = Math.round(height * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1d2a35';
    ctx.fillRect(0, 0, width, height);
    if (!ready) return;
    const s = getState(),
      selected = getSelected(),
      focus = camera.focus || s.hero;
    if (surface.worldVersion !== s.worldVersion) {
      surface = new TerrainSurface(art.materials, s.worldVersion);
      fogKey = '';
      revealTimes.clear();
    }
    unit = Math.min(width / 5.5, 88) * camera.zoom;
    origin = {
      x: width / 2 - (focus.x - focus.y) * unit * 0.72 + camera.x,
      y: height * 0.53 - (focus.x + focus.y - 10) * unit * 0.38 + camera.y,
    };
    const water = ctx.createLinearGradient(0, 0, width, height);
    water.addColorStop(0, '#5cbfbd');
    water.addColorStop(0.45, '#249aa9');
    water.addColorStop(1, '#146387');
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#d1f8ed4a';
    ctx.lineWidth = 1;
    for (let y = 0; y < SIZE; y += 2)
      for (let x = 0; x < SIZE; x += 2) {
        if (terrain(x, y, s.worldVersion) !== 'water') continue;
        const p = pos(x + noise(x, y), y + noise(y, x));
        if (!visible(p, 0)) continue;
        ctx.beginPath();
        ctx.ellipse(
          p.x + Math.sin(now / 3000 + x) * 3,
          p.y,
          unit * (0.1 + noise(x, y) * 0.2),
          unit * 0.025,
          0,
          0,
          Math.PI,
        );
        ctx.stroke();
      }
    surface.draw(ctx, ground);
    surface.drawShore(ctx, ground, now);
    drawPaths(s);
    updateFog(s, now);
    if (screenFog.width !== Math.round(width) || screenFog.height !== Math.round(height)) {
      screenFog.width = Math.round(width);
      screenFog.height = Math.round(height);
    }
    const fogScreen = screenFog.getContext('2d');
    fogScreen.setTransform(1, 0, 0, 1, 0, 0);
    fogScreen.globalCompositeOperation = 'source-over';
    fogScreen.fillStyle = fogScreen.createPattern(cloud, 'repeat');
    fogScreen.fillRect(0, 0, width, height);
    fogScreen.globalCompositeOperation = 'destination-out';
    fogScreen.save();
    ground(fogScreen);
    fogScreen.drawImage(fog, -OFFSET, -OFFSET, TEX / SCALE, TEX / SCALE);
    fogScreen.restore();
    fogScreen.globalCompositeOperation = 'source-over';
    ctx.drawImage(screenFog, 0, 0, width, height);
    interactive = [];
    const objects = [],
      nowReal = Date.now();
    const known = new Set(s.revealed);
    const buildings = new Map(s.buildings.map((b) => [key(b.x, b.y), b]));
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const k = key(x, y);
        if (!known.has(k) || terrain(x, y, s.worldVersion) === 'water') continue;
        const base = pos(x, y);
        if (!visible(base)) continue;
        const building = buildings.get(k);
        if (building) {
          objects.push({
            depth: base.y,
            draw: () => {
              ctx.fillStyle = '#31472724';
              ctx.beginPath();
              ctx.ellipse(base.x + unit * 0.1, base.y, unit * 0.56, unit * 0.18, 0, 0, 7);
              ctx.fill();
              sprite('village', buildingFrame(building.type, building.level), base, unit * 1.42, {
                x,
                y,
                buildingId: building.id,
              });
            },
          });
          continue;
        }
        for (const node of resourcesAt(x, y, s.worldVersion)) {
          const p = pos(node.x, node.y),
            state = s.resourceState?.[node.id],
            cleared = state?.cleared;
          const since = nowReal - (state?.lastHit || 0),
            fall = nowReal - (state?.clearedAt || 0);
          const scale = node.kind === 'wood' ? 0.84 : 0.83;
          const treeFrame =
            node.kind === 'wood'
              ? (noise(Math.floor(x / 3) + 5, Math.floor(y / 3) + 6) < 0.6
                  ? [0, 1, 0, 2, 1, 0, 3, 1]
                  : [2, 4, 5, 3, 6, 4, 5, 7])[node.variant]
              : node.variant;
          const w = unit * scale * node.scale;
          objects.push({
            depth: p.y,
            draw: () => {
              if (cleared) {
                if (fall < 550) {
                  const t = fall / 550;
                  sprite(
                    'nature',
                    treeFrame,
                    { x: p.x + unit * t * 0.15, y: p.y },
                    w,
                    null,
                    node.kind === 'wood' ? t * 0.7 : 0,
                    1 - t,
                  );
                }
                sprite(
                  'nature',
                  node.kind === 'wood' ? 15 : 11,
                  p,
                  unit * (node.kind === 'wood' ? 0.25 : 0.28),
                );
                return;
              }
              ctx.fillStyle = '#294b3023';
              ctx.beginPath();
              ctx.ellipse(p.x + unit * 0.12, p.y, unit * 0.32, unit * 0.11, 0, 0, 7);
              ctx.fill();
              const shake = since < 220 ? Math.sin(since * 0.08) * 0.055 * (1 - since / 220) : 0;
              sprite('nature', treeFrame, p, w, { x, y, resourceId: node.id }, shake);
            },
          });
        }
        if (terrainAt(s, x, y) === 'grass') {
          // Low, non-blocking plants follow patches; they do not pretend to be harvestable trees.
          const fertility = noise(Math.floor(x / 3) + 19, Math.floor(y / 3) + 11);
          const count = fertility > 0.65 ? 3 : fertility > 0.4 ? 1 : 0;
          for (let i = 0; i < count; i++) {
            if (
              noise(x + i * 7, y + 73) < 0.36 ||
              s.buildings.some((b) => Math.hypot(b.x - x, b.y - y) < 1.05)
            )
              continue;
            const p = pos(
              x + (noise(x + i, y + 1) - 0.5) * 0.8,
              y + (noise(y + i, x + 8) - 0.5) * 0.8,
            );
            const plant = noise(x + i, y + 27);
            const frame = plant > 0.9 ? 12 : plant > 0.5 ? 14 : 13;
            objects.push({
              depth: p.y,
              draw: () => sprite('nature', frame, p, unit * (0.17 + noise(x + i, y + 90) * 0.13)),
            });
          }
          if (
            [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].some(([dx, dy]) => terrain(x + dx, y + dy, s.worldVersion) === 'water') &&
            noise(x, y) > 0.55
          )
            objects.push({
              depth: base.y + 3,
              draw: () => sprite('nature', 11, base, unit * 0.28),
            });
        }
      }
    if (s.hero) {
      const p = pos(s.hero.x, s.hero.y);
      objects.push({
        depth: p.y + 0.01,
        draw: () => {
          ctx.fillStyle = '#183c3730';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, unit * 0.14, unit * 0.06, 0, 0, 7);
          ctx.fill();
          const size = unit * 1.02;
          avatar.setResolution(size * dpr);
          avatar.draw(s.hero, now / 1000);
          ctx.drawImage(avatar.canvas, p.x - size / 2, p.y - size * 0.775, size, size);
        },
      });
    }
    for (const worker of s.workers || []) {
      const p = pos(worker.x, worker.y);
      if (
        worker.phase === 'inside' ||
        !visible(p) ||
        !known.has(key(Math.round(worker.x), Math.round(worker.y)))
      )
        continue;
      objects.push({
        depth: p.y + 0.01,
        draw: () => {
          ctx.fillStyle = '#183c3728';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, unit * 0.11, unit * 0.04, 0, 0, 7);
          ctx.fill();
          const size = unit * 0.92;
          avatar.setResolution(size * dpr);
          const owner = s.buildings.find((b) => b.id === worker.buildingId);
          avatar.draw(
            { ...worker, resourceKind: owner?.type === 'lumber' ? 'wood' : 'stone' },
            now / 1000,
            worker.id,
          );
          ctx.save();
          ctx.globalAlpha =
            worker.phase === 'entering'
              ? 1 - (worker.doorMotion?.t || 0)
              : worker.phase === 'emerging'
                ? worker.doorMotion?.t || 0
                : 1;
          ctx.drawImage(avatar.canvas, p.x - size / 2, p.y - size * 0.775, size, size);
          ctx.restore();
        },
      });
    }
    for (const site of s.adventure?.sites || []) {
      if (!known.has(key(site.x, site.y)) || (site.kind === 'building' && site.restored)) continue;
      const p = pos(site.x, site.y);
      if (!visible(p)) continue;
      const bridge = site.kind === 'bridge',
        index = bridge ? (site.restored ? 5 : 4) : (site.art ?? 8);
      objects.push({
        depth: p.y - (bridge ? unit * 0.7 : 0),
        draw: () =>
          sprite(
            'expedition',
            index,
            { x: p.x, y: p.y + (bridge ? unit * 0.8 : 0) },
            unit * (bridge ? 2.15 : site.kind === 'wreck' ? 1.4 : 1.42),
            { x: site.x, y: site.y, siteId: site.id },
          ),
      });
    }
    if (s.adventure?.trader?.active) {
      const t = s.adventure.trader,
        p = pos(t.x, t.y);
      if (known.has(key(t.x, t.y)) && visible(p)) {
        objects.push({
          depth: p.y,
          draw: () => sprite('expedition', 7, p, unit * 0.9, { x: t.x, y: t.y, event: true }),
        });
      }
    }
    if (s.adventure?.trader?.active) {
      const t = s.adventure.trader,
        p = pos(t.x + 0.48, t.y - 0.12);
      if (known.has(key(t.x, t.y)) && visible(p))
        objects.push({
          depth: p.y,
          draw: () => {
            const size = unit * 0.92;
            avatar.setResolution(size * dpr);
            avatar.draw({ angle: -0.65, action: 'idle' }, now / 1000, 'merchant');
            ctx.drawImage(avatar.canvas, p.x - size / 2, p.y - size * 0.775, size, size);
          },
        });
    }
    objects.sort((a, b) => a.depth - b.depth);
    for (const o of objects) o.draw();
    const destination = options.destination?.();
    if (destination) {
      const p = pos(destination.x, destination.y);
      ctx.strokeStyle = '#ffefb1b0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, unit * 0.11, unit * 0.055, 0, 0, 7);
      ctx.stroke();
    }
    const harvest = options.harvestTarget?.();
    if (harvest && s.hero.action !== 'walk') {
      const state = s.resourceState?.[harvest.resourceId],
        age = nowReal - (state?.lastHit || 0);
      if (age < 400) {
        const node = resourcesAt(harvest.x, harvest.y, s.worldVersion).find(
            (n) => n.id === harvest.resourceId,
          ),
          p = pos(node?.x || harvest.x, node?.y || harvest.y),
          t = age / 400;
        ctx.globalAlpha = 1 - t;
        for (let i = 0; i < 9; i++) {
          ctx.fillStyle = s.hero.action === 'mine' ? '#dce0ce' : '#dabb77';
          const dx = (noise(i, 3) - 0.5) * unit * 0.55 * t,
            dy = -Math.sin(t * Math.PI) * unit * 0.22;
          ctx.fillRect(p.x + dx, p.y + dy - unit * 0.12, unit * 0.02, unit * 0.02);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (selected) {
      const p = pos(selected.x, selected.y);
      ctx.strokeStyle = '#ffe0a58a';
      ctx.fillStyle = '#ffe0a518';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, unit * 0.48, unit * 0.18, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
    canvas.dataset.sprites = String(objects.length);
  }
  function worldPoint({ x, y }) {
    const a = (x - origin.x) / (unit * 0.72),
      b = (y - origin.y) / (unit * 0.38) + 10;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
  function hit(point) {
    if (!ready) return null;
    for (const item of [...interactive].reverse()) {
      const u = (point.x - item.left) / item.w,
        v = (point.y - item.top) / item.h;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const [sx, sy, sw, sh] = item.frame,
        image = art[item.atlas];
      const px = Math.floor(u * sw),
        py = Math.floor(v * sh);
      if (art.framePixels[item.atlas][item.index][(py * sw + px) * 4 + 3] > 64) return item.tile;
    }
    const p = worldPoint(point),
      x = Math.round(p.x),
      y = Math.round(p.y);
    return x >= 0 &&
      y >= 0 &&
      x < SIZE &&
      y < SIZE &&
      terrain(x, y, getState().worldVersion) !== 'water'
      ? { x, y }
      : null;
  }
  function frame(now) {
    if (!document.hidden && now - lastFrame >= 33) {
      const dt = Math.min(0.12, (now - lastFrame) / 1000);
      if (ready) options.update?.(dt);
      draw(now);
      lastFrame = now;
      frameCount++;
    }
    if (now - fpsTime > 1500) {
      canvas.dataset.fps = String(Math.round((frameCount * 1000) / (now - fpsTime)));
      fpsTime = now;
      frameCount = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const thumbnails = new Map();
  return {
    thumbnail(atlas, index) {
      if (!ready) return null;
      const key = atlas + index;
      if (!thumbnails.has(key)) {
        const source = art.frameImages[atlas]?.[index];
        if (!source) return null;
        const c = document.createElement('canvas');
        c.width = c.height = 80;
        const cx = c.getContext('2d'),
          scale = Math.min(76 / source.width, 76 / source.height);
        cx.drawImage(
          source,
          (80 - source.width * scale) / 2,
          (80 - source.height * scale) / 2,
          source.width * scale,
          source.height * scale,
        );
        thumbnails.set(key, c.toDataURL());
      }
      return thumbnails.get(key);
    },
    draw,
    hit,
    worldPoint,
    ready: readyPromise,
    get loaded() {
      return ready;
    },
    get error() {
      return error;
    },
  };
}
