import { RES } from './engine.js';
const ATLAS = {
  wood: ['props', 0],
  stone: ['props', 1],
  gold: ['props', 3],
  planks: ['items', 0],
  cutStone: ['items', 1],
  silver: ['items', 2],
  charcoal: ['items', 3],
  ironOre: ['items', 4],
  iron: ['items', 5],
  backpack: ['items', 6],
  order: ['items', 7],
  tools: ['items', 8],
};
export function iconSource(kind, renderer) {
  if (kind === 'food') return './assets/food-v09.png';
  const a = ATLAS[kind];
  return a ? renderer.thumbnail(...a) : null;
}
export function materialIcon(kind, renderer) {
  const src = iconSource(kind, renderer);
  return src
    ? `<img class="material-icon" src="${src}" alt="" aria-hidden="true">`
    : '<span class="material-icon"></span>';
}
export function materialAmounts(values, renderer, { available } = {}) {
  return `<span class="material-amounts">${Object.entries(values)
    .map(
      ([k, n]) =>
        `<span class="material-amount ${available && available[k] < n ? 'missing' : ''}" aria-label="${RES[k][1]}: ${available ? Math.floor(available[k]) + ' / ' : ''}${n}">${materialIcon(k, renderer)}<strong>${available ? Math.floor(available[k]) + ' / ' : ''}${n}</strong><span class="material-name">${RES[k][1]}</span></span>`,
    )
    .join('')}</span>`;
}
