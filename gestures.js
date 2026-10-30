// Coordinates are local to the canvas. Pinches keep the world point under the midpoint.
export function attachGestures(canvas, camera, { change, tap, steer, stick }) {
  const points = new Map();
  let baseline = null,
    blocked = false,
    multiTouch = false;
  const snapshot = () => {
    const p = [...points.values()];
    baseline = { points: p.map((q) => ({ ...q })), zoom: camera.zoom, x: camera.x, y: camera.y };
  };
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const apply = () => {
    const p = [...points.values()],
      b = baseline;
    if (!b || !p.length) return;
    if (steer && p.length === 1) {
      if (multiTouch) return;
      const dx = p[0].x - p[0].startX,
        dy = p[0].y - p[0].startY,
        d = Math.hypot(dx, dy),
        radius = 52;
      steer({ x: d > 7 ? dx / Math.max(radius, d) : 0, y: d > 7 ? dy / Math.max(radius, d) : 0 });
      stick?.({
        x: p[0].startX,
        y: p[0].startY,
        dx: (dx / Math.max(1, d)) * Math.min(d, radius),
        dy: (dy / Math.max(1, d)) * Math.min(d, radius),
      });
      return;
    }
    if (p.length === 1 && b.points.length === 1) {
      camera.x = b.x + p[0].x - b.points[0].x;
      camera.y = b.y + p[0].y - b.points[0].y;
    } else if (p.length >= 2 && b.points.length >= 2) {
      const distance = (q) => Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y);
      const mid = (q) => ({ x: (q[0].x + q[1].x) / 2, y: (q[0].y + q[1].y) / 2 });
      const a = mid(b.points),
        n = mid(p),
        r = canvas.getBoundingClientRect();
      camera.zoom = Math.max(
        0.65,
        Math.min(3.5, (b.zoom * distance(p)) / Math.max(1, distance(b.points))),
      );
      const ratio = camera.zoom / b.zoom;
      camera.x = n.x - r.width / 2 - (a.x - r.width / 2 - b.x) * ratio;
      camera.y =
        n.y -
        r.height * (camera.anchorY ?? 0.5) -
        (a.y - r.height * (camera.anchorY ?? 0.5) - b.y) * ratio;
    }
    change();
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (points.size >= 2) {
      blocked = true;
      return;
    }
    const p = local(e);
    points.set(e.pointerId, { ...p, startX: p.x, startY: p.y });
    canvas.setPointerCapture(e.pointerId);
    if (points.size > 1) {
      blocked = true;
      multiTouch = true;
      steer?.({ x: 0, y: 0 });
      stick?.(null);
    }
    snapshot();
  });
  canvas.addEventListener('pointermove', (e) => {
    const old = points.get(e.pointerId);
    if (!old) return;
    e.preventDefault();
    const p = local(e);
    if (Math.hypot(p.x - old.startX, p.y - old.startY) > 7) blocked = true;
    points.set(e.pointerId, { ...old, ...p });
    if (blocked || points.size > 1) apply();
  });
  const end = (e, cancel) => {
    const p = points.get(e.pointerId);
    if (!p) return;
    const shouldTap = !cancel && !blocked && points.size === 1;
    points.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    steer?.({ x: 0, y: 0 });
    stick?.(null);
    if (shouldTap) tap(local(e));
    if (points.size) snapshot();
    else {
      baseline = null;
      blocked = false;
      multiTouch = false;
    }
  };
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));
  canvas.addEventListener('lostpointercapture', (e) => {
    if (points.has(e.pointerId)) end(e, true);
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = local(e),
        r = canvas.getBoundingClientRect(),
        old = camera.zoom;
      camera.zoom = Math.max(0.65, Math.min(3.5, old * Math.exp(-e.deltaY * 0.002)));
      const ratio = camera.zoom / old;
      camera.x = p.x - r.width / 2 - (p.x - r.width / 2 - camera.x) * ratio;
      camera.y =
        p.y -
        r.height * (camera.anchorY ?? 0.5) -
        (p.y - r.height * (camera.anchorY ?? 0.5) - camera.y) * ratio;
      change();
    },
    { passive: false },
  );
}
