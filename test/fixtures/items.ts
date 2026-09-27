import type { ItemValue } from '../../src/core/types';

/** Trimmed Rolimons response. Rows copied from the live API, plus edge cases. */
export const rolimonsResponse = {
  success: true,
  item_count: 5,
  items: {
    '1028606': ['Red Baseball Cap', '', 1304, -1, 1304, -1, -1, -1, -1, -1, 1],
    '1029025': ['The Classic ROBLOX Fedora', 'CF', 370459, 430000, 430000, 4, 2, -1, -1, -1, 1],
    '1031429': ['Domino Crown', 'DC', 2_900_000, 3_100_000, 3_100_000, 3, 3, 1, 1, 1, 1],
    '0': ['Bad id', '', 1, -1, 1, -1, -1, -1, -1, -1],
    '1234': 'not an array',
  },
};

export function item(overrides: Partial<ItemValue> & { id: number }): ItemValue {
  return {
    name: `Item ${overrides.id}`,
    acronym: '',
    rap: 1000,
    value: null,
    demand: null,
    trend: null,
    projected: false,
    hyped: false,
    rare: false,
    ...overrides,
  };
}
