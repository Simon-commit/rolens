import { parseRolimonsItems, ROLIMONS_ITEMS_URL } from '../core/rolimons';
import type { ValueProvider } from './types';

export const rolimons: ValueProvider = {
  id: 'rolimons',
  label: "Rolimon's",
  homepage: 'https://www.rolimons.com',
  available: true,
  itemUrl: (id) => `https://www.rolimons.com/item/${id}`,
  async fetchItems(fetchFn) {
    const response = await fetchFn(ROLIMONS_ITEMS_URL, {
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Rolimons responded with HTTP ${response.status}`);
    return parseRolimonsItems(await response.json());
  },
};
