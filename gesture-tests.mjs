import assert from 'node:assert/strict';
import { attachGestures } from './gestures.js';
const handlers = {},
  captured = new Set();
const canvas = {
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 393, height: 852 }),
  addEventListener: (n, f) => (handlers[n] = f),
  setPointerCapture: (id) => captured.add(id),
  hasPointerCapture: (id) => captured.has(id),
  releasePointerCapture: (id) => captured.delete(id),
};
const camera = { x: 0, y: 0, zoom: 1 };
let taps = 0,
  changes = 0;
attachGestures(canvas, camera, { change: () => changes++, tap: () => taps++ });
const e = (id, x, y) => ({
  pointerId: id,
  clientX: x + 10,
  clientY: y + 20,
  pointerType: 'touch',
  preventDefault() {},
});
handlers.pointerdown(e(1, 100, 200));
handlers.pointerup(e(1, 100, 200));
assert.equal(taps, 1);
handlers.pointerdown(e(1, 100, 200));
handlers.pointermove(e(1, 150, 240));
assert.equal(camera.x, 50);
assert.equal(camera.y, 40);
handlers.pointerup(e(1, 150, 240));
assert.equal(taps, 1);
Object.assign(camera, { x: 0, y: 0, zoom: 1 });
handlers.pointerdown(e(1, 100, 400));
handlers.pointerdown(e(2, 200, 400));
handlers.pointermove(e(2, 300, 400));
assert.equal(camera.zoom, 2);
assert.equal(camera.x, 96.5);
assert.equal(camera.y, 26);
handlers.pointerup(e(2, 300, 400));
handlers.pointermove(e(1, 120, 410));
assert.equal(camera.x, 116.5);
assert.equal(camera.y, 36);
handlers.pointerup(e(1, 120, 410));
assert.equal(taps, 1);
handlers.pointerdown(e(1, 100, 200));
handlers.pointercancel(e(1, 100, 200));
assert.equal(taps, 1);
handlers.pointerdown(e(1, 50, 200));
handlers.pointerdown(e(2, 150, 200));
handlers.pointermove(e(2, 10000, 200));
assert.equal(camera.zoom, 3.5);
handlers.pointerup(e(2, 10000, 200));
handlers.pointerup(e(1, 50, 200));
assert.ok(changes > 0);
console.log(
  'PASS: érintés, húzás, kétujjas nagyítás és középpont, átmenet egy ujjra, megszakítás, nagyítási korlát.',
);
