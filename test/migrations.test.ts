import { describe, expect, it } from 'vitest';
import { migrateStorage, STORAGE_VERSION, STORAGE_VERSION_KEY, type StorageArea } from '../src/core/migrations';
import { normaliseAlerts } from '../src/core/alerts';
import { normaliseSettings } from '../src/core/settings';

function area(initial: Record<string, unknown> = {}): StorageArea & { data: Record<string, unknown> } {
  const data = structuredClone(initial);
  return {
    data,
    get: (keys) =>
      Promise.resolve(
        Object.fromEntries(
          [keys]
            .flat()
            .filter((k) => k in data)
            .map((k) => [k, structuredClone(data[k])]),
        ),
      ),
    set: (items) => {
      Object.assign(data, structuredClone(items));
      return Promise.resolve();
    },
  };
}

const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEF';

describe('settings survive updates', () => {
  it('upgrades a 0.4 install without losing anything the user set', async () => {
    const sync = area({
      settings: { source: 'routility', theme: 'dark', compactNumbers: false, usdRate: 2.5, showBadges: false },
    });
    const alerts = { enabled: true, desktop: true, discordWebhook: WEBHOOK, ntfyTopic: 'rolens-simon', minGain: 1000 };
    const local = area({ alerts });
    expect(await migrateStorage({ sync, local })).toEqual({ from: 0, to: STORAGE_VERSION });

    expect(sync.data.settings).toEqual({
      theme: 'dark',
      compactNumbers: false,
      usdRate: 2.5,
      showBadges: false,
      useRolimons: false,
      useRoutility: true,
    });
    const settings = normaliseSettings(sync.data.settings);
    expect(settings).toMatchObject({ theme: 'dark', compactNumbers: false, usdRate: 2.5, useRoutility: true });
    expect(local.data.alerts).toEqual(alerts);
    expect(normaliseAlerts(local.data.alerts)).toMatchObject({ discordWebhook: WEBHOOK, ntfyTopic: 'rolens-simon' });
    expect(local.data[STORAGE_VERSION_KEY]).toBe(STORAGE_VERSION);
  });

  it('keeps the source switches when both old and new keys are stored', async () => {
    const sync = area({ settings: { source: 'rolimons', useRolimons: true, useRoutility: true } });
    await migrateStorage({ sync, local: area() });
    expect(sync.data.settings).toEqual({ useRolimons: true, useRoutility: true });
  });

  it('leaves current settings untouched and runs each step once', async () => {
    const current = { settings: { theme: 'light', colorBlind: true } };
    const sync = area(current);
    const local = area();
    await migrateStorage({ sync, local });
    expect(sync.data).toEqual(current);
    expect(await migrateStorage({ sync, local })).toEqual({ from: STORAGE_VERSION, to: STORAGE_VERSION });
  });

  it('does not touch storage written by a newer release', async () => {
    const sync = area({ settings: { source: 'routility', futureKey: 1 } });
    const local = area({ [STORAGE_VERSION_KEY]: STORAGE_VERSION + 5 });
    await migrateStorage({ sync, local });
    expect(sync.data.settings).toEqual({ source: 'routility', futureKey: 1 });
    expect(local.data[STORAGE_VERSION_KEY]).toBe(STORAGE_VERSION + 5);
  });

  it('starts fresh installs at the current version with nothing to carry over', async () => {
    const sync = area();
    const local = area();
    await migrateStorage({ sync, local });
    expect(sync.data).toEqual({});
    expect(local.data[STORAGE_VERSION_KEY]).toBe(STORAGE_VERSION);
  });
});
