/** A world label follows its own building and is never clamped to the screen edge. */
export function buildingLabel(p, unit, aspect, working) {
  const width = working ? Math.max(116, Math.min(154, unit * 1.5)) : 66,
    height = working ? 49 : 22;
  return { left: p.x - width / 2, top: p.y - unit * 1.42 * aspect - 12 - height, width, height };
}
