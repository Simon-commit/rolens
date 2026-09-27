import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normaliseSettings } from '../src/core/settings';
import { isRequest } from '../src/core/messages';

describe('normaliseSettings', () => {
  it('falls back to defaults', () => {
    expect(normaliseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings('junk')).toEqual(DEFAULT_SETTINGS);
  });

  it('accepts known themes only', () => {
    expect(normaliseSettings({ theme: 'dark' }).theme).toBe('dark');
    expect(normaliseSettings({ theme: 'neon' }).theme).toBe('auto');
  });

  it('accepts a sane USD rate only', () => {
    expect(normaliseSettings({ usdRate: 3.5 }).usdRate).toBe(3.5);
    expect(normaliseSettings({ usdRate: -1 }).usdRate).toBe(3);
    expect(normaliseSettings({ usdRate: '3' }).usdRate).toBe(3);
    expect(normaliseSettings({ usdRate: 1e9 }).usdRate).toBe(3);
    // Clearing the rate in the popup turns estimates off.
    expect(normaliseSettings({ usdRate: null }).usdRate).toBeNull();
  });

  it('keeps valid keys and drops invalid ones', () => {
    expect(normaliseSettings({ showBadges: false, source: 'evil', compactNumbers: 'yes' })).toEqual({
      ...DEFAULT_SETTINGS,
      showBadges: false,
    });
  });
});

describe('isRequest', () => {
  it('accepts well-formed requests only', () => {
    expect(isRequest({ type: 'rolens:getItems', ids: [1, 2] })).toBe(true);
    expect(isRequest({ type: 'rolens:getStatus' })).toBe(true);
    expect(isRequest({ type: 'rolens:getItems', ids: ['1'] })).toBe(false);
    expect(isRequest({ type: 'rolens:getItems', ids: [-1] })).toBe(false);
    expect(isRequest({ type: 'other' })).toBe(false);
    expect(isRequest(null)).toBe(false);
  });
});

describe('sources', () => {
  it('always keeps at least one source on', () => {
    expect(normaliseSettings({ useRolimons: false, useRoutility: false })).toMatchObject({
      useRolimons: true,
      useRoutility: false,
    });
    expect(normaliseSettings({ useRolimons: false })).toMatchObject({ useRolimons: false, useRoutility: true });
  });
});
