import { freshAdventure, validateCampaign } from './adventure.js';
export const STORE = 'szigetkert.save.v1',
  BACKUP = 'szigetkert.backup.v1';
export function loadGame(storage = localStorage) {
  const raw = storage.getItem(STORE);
  if (!raw) return { state: freshAdventure(), writable: true };
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version === 1 && !storage.getItem(BACKUP)) storage.setItem(BACKUP, raw);
    if (parsed.version === 2 && !storage.getItem('szigetkert.backup.v2'))
      storage.setItem('szigetkert.backup.v2', raw);
    if (parsed.version <= 3 && !storage.getItem('szigetkert.backup.pre-adventure'))
      storage.setItem('szigetkert.backup.pre-adventure', raw);
    if (parsed.version <= 4 && !storage.getItem('szigetkert.backup.pre-supply-v5'))
      storage.setItem('szigetkert.backup.pre-supply-v5', raw);
    if (parsed.version <= 5 && !storage.getItem('szigetkert.backup.pre-chapter-v6'))
      storage.setItem('szigetkert.backup.pre-chapter-v6', raw);
    if (parsed.version <= 6 && !storage.getItem('szigetkert.backup.pre-simplification-v7'))
      storage.setItem('szigetkert.backup.pre-simplification-v7', raw);
    if (parsed.version <= 7 && !storage.getItem('szigetkert.backup.pre-v12-v8'))
      storage.setItem('szigetkert.backup.pre-v12-v8', raw);
    return { state: validateCampaign(parsed), writable: true };
  } catch (error) {
    return { state: freshAdventure(), writable: false, error };
  }
}
export function saveGame(state, storage = localStorage) {
  storage.setItem(STORE, JSON.stringify(state));
}
export function importGame(text) {
  if (text.length > 8000000) throw Error('Túl nagy mentésfájl.');
  return validateCampaign(JSON.parse(text));
}
