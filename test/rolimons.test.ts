import { describe, expect, it } from 'vitest';
import { parseRolimonsItems, RolimonsParseError } from '../src/core/rolimons';
import { rolimonsResponse } from './fixtures/items';

describe('parseRolimonsItems', () => {
  const items = parseRolimonsItems(rolimonsResponse);

  it('maps positional rows to named fields', () => {
    expect(items['1029025']).toEqual({
      id: 1029025,
      name: 'The Classic ROBLOX Fedora',
      acronym: 'CF',
      rap: 370459,
      value: 430000,
      demand: 'amazing',
      trend: 'stable',
      projected: false,
      hyped: false,
      rare: false,
    });
  });

  it('treats -1 as unvalued and unrated', () => {
    expect(items['1028606']).toMatchObject({ value: null, demand: null, trend: null });
  });

  it('reads flags', () => {
    expect(items['1031429']).toMatchObject({ projected: true, hyped: true, rare: true, trend: 'raising' });
  });

  it('skips malformed rows and invalid ids', () => {
    expect(Object.keys(items).sort()).toEqual(['1028606', '1029025', '1031429']);
  });

  it('rejects unexpected shapes', () => {
    expect(() => parseRolimonsItems({ success: false })).toThrow(RolimonsParseError);
    expect(() => parseRolimonsItems(null)).toThrow(RolimonsParseError);
    expect(() => parseRolimonsItems({ success: true, items: {} })).toThrow(/no usable items/);
  });
});
