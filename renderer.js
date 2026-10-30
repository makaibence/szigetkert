import { CHAPTER_TRAILS, RECIPES } from './content.js';
import { buildingLabel } from './world-ui.js';
import { productionProgress } from './production.js';
import { RES } from './engine.js';
import { MATERIAL_ART } from './ui-icons.js';
import { siteVisible, carpenterWaiting } from './chapter.js';
import { siteReadiness } from './site-actions.js';
import { TRAILS, EARLY_TRAILS } from './island-layout.js';
import {
  SIZE,
  key,
  terrain,
  terrainAt,
  resourcesAt,
  liveResources,
  noise,
  arrivalBeach,
} from './world.js';
import { placement } from './engine.js';
import { loadArt, buildingFrame, buildingArt } from './art.js';
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
      s.worldVersion >= 2
        ? s.worldVersion >= 4
          ? CHAPTER_TRAILS
          : s.worldVersion >= 3
            ? [...TRAILS, ...EARLY_TRAILS]
            : TRAILS
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
        let onLand = false;
        for (let i = 1; i < line.length; i++) {
          const [ax, ay] = line[i - 1],
            [bx, by] = line[i],
            steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.1);
          for (let j = 1; j <= steps; j++) {
            const x = ax + ((bx - ax) * j) / steps,
              y = ay + ((by - ay) * j) / steps;
            if (terrain(Math.round(x), Math.round(y), s.worldVersion) === 'water') onLand = false;
            else if (!onLand) {
              ctx.moveTo(x, y);
              onLand = true;
            } else ctx.lineTo(x, y);
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
          p.y + Math.cos(now / 2600 + x * 0.8 + y) * unit * 0.016,
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
              const ba = buildingArt(building.type, building.level);
              sprite(ba.atlas, ba.index, base, unit * 1.42, {
                x,
                y,
                buildingId: building.id,
              });
            },
          });
          continue;
        }
        const live = liveResources(s, x, y);
        for (const node of resourcesAt(x, y, s.worldVersion)) {
          if (!s.resourceState?.[node.id]?.cleared && !live.some((n) => n.id === node.id)) continue;
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
              sprite('nature', treeFrame, p, w, { x, y, resourceId: node.id }, shake, 1);
            },
          });
        }
        if (terrainAt(s, x, y) === 'grass' && !arrivalBeach(s, x, y)) {
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
          interactive.push({
            left: p.x - size * 0.17,
            top: p.y - size * 0.62,
            w: size * 0.34,
            h: size * 0.62,
            tile: { workerId: worker.id },
          });
        },
      });
    }
    const discovery = s.chapter ? null : s.adventure?.pending;
    if (
      discovery?.target &&
      discovery.type !== 'visitor' &&
      known.has(key(discovery.target.x, discovery.target.y))
    ) {
      const p = pos(discovery.target.x, discovery.target.y);
      if (visible(p))
        objects.push({
          depth: p.y,
          draw: () =>
            sprite(
              discovery.type === 'traces' ? 'expedition' : 'props',
              discovery.type === 'traces' ? 8 : discovery.type === 'request' ? 5 : 7,
              p,
              unit * (discovery.type === 'traces' ? 0.55 : 0.38),
              { x: discovery.target.x, y: discovery.target.y, discovery: true },
            ),
        });
    }
    for (const site of s.adventure?.sites || []) {
      if (
        !siteVisible(s, site) ||
        !known.has(key(site.x, site.y)) ||
        (site.kind === 'building' && site.restored)
      )
        continue;
      const p =
        site.kind === 'wreck' && s.worldVersion >= 2
          ? pos(site.x - 1.7, site.y + 0.15)
          : pos(site.x, site.y);
      if (!visible(p)) continue;
      if (site.type === 'hut') {
        objects.push({
          depth: p.y,
          draw: () =>
            sprite('village', 0, p, unit * 1.42, { x: site.x, y: site.y, siteId: site.id }),
        });
        continue;
      }
      if (site.kind === 'forage') {
        objects.push({
          depth: p.y,
          draw: () =>
            sprite('nature', 14, p, unit * 0.47, { x: site.x, y: site.y, siteId: site.id }),
        });
        continue;
      }
      if (site.kind === 'ore') {
        if (site.oreLeft === 0) continue;
        objects.push({
          depth: p.y,
          draw: () => sprite('items', 4, p, unit * 0.7, { x: site.x, y: site.y, siteId: site.id }),
        });
        continue;
      }
      if (
        site.type &&
        ['sawmill', 'mason', 'kiln', 'forge', 'residence', 'tradepost'].includes(site.type)
      ) {
        const ba = buildingArt(site.type, 1);
        objects.push({
          depth: p.y,
          draw: () => {
            sprite(ba.atlas, ba.index, p, unit * 1.42, { x: site.x, y: site.y, siteId: site.id });
            ctx.fillStyle = '#45362588';
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, unit * 0.2, unit * 0.08, 0, 0, 7);
            ctx.fill();
          },
        });
        continue;
      }
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
    const residence = s.adventure?.sites.find(
      (p) =>
        p.id ===
        (carpenterWaiting(s) ||
        (s.chapter?.carpenterIntro && !s.chapter.completedOrders.includes('house-repair'))
          ? 'camp'
          : 'house'),
    );
    if (
      residence &&
      (residence.id !== 'house' || s.chapter?.completedOrders.includes('house-repair')) &&
      known.has(key(residence.x, residence.y))
    ) {
      const p = pos(residence.x + 0.75, residence.y + 0.3);
      if (visible(p))
        objects.push({
          depth: p.y + 0.01,
          draw: () => {
            const size = unit * 0.86;
            avatar.setResolution(size * dpr);
            avatar.draw({ angle: -0.65, action: 'idle' }, now / 1000, 'carpenter');
            ctx.drawImage(avatar.canvas, p.x - size / 2, p.y - size * 0.775, size, size);
            interactive.push({
              left: p.x - size * 0.18,
              top: p.y - size * 0.65,
              w: size * 0.36,
              h: size * 0.65,
              tile: { siteId: residence.id, x: residence.x, y: residence.y },
            });
          },
        });
    }
    objects.sort((a, b) => a.depth - b.depth);
    for (const o of objects) o.draw();
    for (const w of s.workers || []) {
      if (
        w.phase === 'inside' ||
        !known.has(key(Math.round(w.x), Math.round(w.y))) ||
        !((w.energy ?? 100) <= 25 || options.selectedWorker?.() === w.id)
      )
        continue;
      const p = pos(w.x, w.y);
      if (!visible(p)) continue;
      const bw = Math.max(22, unit * 0.31),
        bh = 5,
        top = p.y - unit * 0.67;
      ctx.fillStyle = '#182832dd';
      ctx.fillRect(p.x - bw / 2 - 1, top - 1, bw + 2, bh + 2);
      ctx.fillStyle = w.energy > 65 ? '#83bd51' : w.energy > 25 ? '#dfaa43' : '#cc6451';
      ctx.fillRect(p.x - bw / 2, top, (bw * Math.max(0, w.energy)) / 100, bh);
    }
    for (const b of s.buildings) {
      if (!known.has(key(b.x, b.y))) continue;
      const p = pos(b.x, b.y),
        progress = productionProgress(s, b),
        ba = buildingArt(b.type, b.level || 1),
        f = art.manifest[ba.atlas].frames[ba.index];
      if (p.x < 0 || p.x > width || p.y < 0 || p.y > height + unit * 1.5) continue;
      const box = buildingLabel(p, unit, f[3] / f[2], !!progress),
        left = box.left,
        top = box.top,
        w = box.width,
        h = box.height;
      const site = s.adventure?.sites.find((p) => p.buildingId === b.id),
        ready = site && siteReadiness(s, site);
      ctx.fillStyle = '#203c3fee';
      ctx.strokeStyle = '#c6b981a0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(left, top, w, h, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff1ce';
      ctx.font = '600 10px system-ui';
      ctx.textAlign = 'center';
      if (progress) {
        ctx.fillText(
          `${b.level || 1}. szint · ${progress.completed}/${progress.total} kész`,
          left + w / 2,
          top + 13,
          w - 12,
        );
        const input = Object.keys(progress.recipe.input)[0],
          output = progress.outputKind;
        const drawIcon = (kind, x) => {
          const a = MATERIAL_ART[kind];
          if (a) ctx.drawImage(art.frameImages[a[0]][a[1]], x, top + 18, 15, 15);
        };
        ctx.textAlign = 'left';
        drawIcon(input, left + 7);
        ctx.font = '10px system-ui';
        ctx.fillText(String(progress.inputLeft[input]), left + 24, top + 29, w * 0.22);
        ctx.fillText('→', left + w * 0.45, top + 29);
        drawIcon(output, left + w * 0.58);
        ctx.fillText(String(progress.outputLeft[output]), left + w * 0.58 + 17, top + 29, w * 0.25);
        ctx.fillStyle = '#132a2d';
        ctx.beginPath();
        ctx.roundRect(left + 7, top + 38, w - 14, 5, 3);
        ctx.fill();
        ctx.fillStyle = '#a5c766';
        ctx.beginPath();
        ctx.roundRect(left + 7, top + 38, Math.max(1, (w - 14) * progress.fraction), 5, 3);
        ctx.fill();
      } else
        ctx.fillText(`${b.level || 1}. szint${ready ? ' ↑' : ''}`, left + w / 2, top + 15, w - 8);
      ctx.textAlign = 'left';
      interactive.push({
        left,
        top,
        w,
        h,
        tile: { x: b.x, y: b.y, siteId: site?.id, buildingId: b.id, badge: true },
      });
    }
    for (const site of s.adventure?.sites || []) {
      const ready = siteReadiness(s, site);
      if (
        site.restored ||
        !ready ||
        !siteVisible(s, site) ||
        (site.buildingId &&
          productionProgress(
            s,
            s.buildings.find((b) => b.id === site.buildingId),
          ))
      )
        continue;
      const p =
        site.kind === 'wreck' && s.worldVersion >= 2
          ? pos(site.x - 1.7, site.y + 0.15)
          : pos(site.x, site.y);
      if (!visible(p)) continue;
      const b = site.buildingId && s.buildings.find((b) => b.id === site.buildingId),
        ba = site.type ? buildingArt(site.type, b?.level || 1) : null;
      const f = ba && art.manifest[ba.atlas].frames[ba.index],
        h = f ? (unit * 1.42 * f[3]) / f[2] : unit * 0.8;
      const y = p.y - h - 12 + Math.sin(now / 600) * 2;
      ctx.fillStyle = '#f3df88';
      ctx.strokeStyle = '#5c713b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.x - 14, y - 14, 28, 28, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#496932';
      ctx.beginPath();
      ctx.moveTo(p.x, y - 7);
      ctx.lineTo(p.x + 8, y + 1);
      ctx.lineTo(p.x + 3, y + 1);
      ctx.lineTo(p.x + 3, y + 7);
      ctx.lineTo(p.x - 3, y + 7);
      ctx.lineTo(p.x - 3, y + 1);
      ctx.lineTo(p.x - 8, y + 1);
      ctx.closePath();
      ctx.fill();
      interactive.push({
        left: p.x - 14,
        top: y - 14,
        w: 28,
        h: 28,
        tile: { x: site.x, y: site.y, siteId: site.id, badge: true },
      });
    }
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
      if (!item.frame || item.tile.workerId || item.tile.badge) return item.tile;
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
