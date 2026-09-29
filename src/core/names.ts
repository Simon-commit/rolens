import type { ItemValue } from './types';

/*
 * Matching items by name, for limiteds Roblox now shows under a different id than the
 * one Rolimon's tracks. Roblox turned classic faces into heads and bundles with new ids,
 * so "Red Fang" on Roblox is not the id Rolimon's values. Only exact, unique names match.
 */

/** Case, spacing and quote style are ignored; everything else must match exactly. */
export function normaliseName(name: string): string {
  return name.normalize('NFKC').replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Name to item id; null where two limiteds share a name, so neither is guessed. */
export function buildNameIndex(items: Record<string, ItemValue>): Map<string, number | null> {
  const index = new Map<string, number | null>();
  for (const item of Object.values(items)) {
    const key = normaliseName(item.name);
    if (!key) continue;
    index.set(key, index.has(key) ? null : item.id);
  }
  return index;
}
