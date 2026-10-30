import { fresh, validate } from './engine.js';
export const STORE = 'szigetkert.save.v1',
  BACKUP = 'szigetkert.backup.v1';
export function loadGame(storage = localStorage) {
  const raw = storage.getItem(STORE);
  if (!raw) return { state: fresh(), writable: true };
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version === 1 && !storage.getItem(BACKUP)) storage.setItem(BACKUP, raw);
    if (parsed.version === 2 && !storage.getItem('szigetkert.backup.v2'))
      storage.setItem('szigetkert.backup.v2', raw);
    return { state: validate(parsed), writable: true };
  } catch (error) {
    return { state: fresh(), writable: false, error };
  }
}
export function saveGame(state, storage = localStorage) {
  storage.setItem(STORE, JSON.stringify(state));
}
export function importGame(text) {
  if (text.length > 4000000) throw Error('Túl nagy mentésfájl.');
  return validate(JSON.parse(text));
}
