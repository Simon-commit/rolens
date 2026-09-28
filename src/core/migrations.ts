/*
 * Keeps what users set up when RoLens updates. Chrome keeps chrome.storage through an
 * update, so values only get lost if a release renames or restructures a key and then
 * reads the new one. Every such change gets a step here instead: the step moves the old
 * value over, the stored version records which steps have run, and each step runs once.
 *
 * Where things live:
 * - chrome.storage.sync `settings`: the popup's switches, theme and display choices.
 * - chrome.storage.local `alerts`: Discord webhook, ntfy topic and alert filters.
 * - chrome.storage.local: saved trades, value snapshots and alert state, which RoLens can
 *   rebuild, so they are never migrated, only dropped when their format is unreadable.
 * - The popup's last open tab is kept in the popup's localStorage, a convenience only.
 */

export const STORAGE_VERSION_KEY = 'storageVersion';

export interface StorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface Stores {
  sync: StorageArea;
  local: StorageArea;
}

interface Migration {
  /** The storage version after this step. */
  version: number;
  run(stores: Stores): Promise<void>;
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** In order. Never edit a step once released; add a new one. */
export const MIGRATIONS: readonly Migration[] = [
  {
    // Releases up to 0.4 stored a single `source`, replaced by the two source switches.
    // An old install that never set the switches keeps the source it chose.
    version: 1,
    async run({ sync }) {
      const settings = record((await sync.get('settings')).settings);
      if (!settings || !('source' in settings)) return;
      const { source, ...rest } = settings;
      if (!('useRolimons' in rest) && !('useRoutility' in rest)) {
        if (source === 'routility') Object.assign(rest, { useRolimons: false, useRoutility: true });
        if (source === 'rolimons') Object.assign(rest, { useRolimons: true, useRoutility: false });
      }
      await sync.set({ settings: rest });
    },
  },
];

export const STORAGE_VERSION = MIGRATIONS.at(-1)!.version;

/**
 * Runs the steps this install has not run yet. Storage written by a newer release (after
 * a downgrade) is left exactly as it is. Returns the versions before and after.
 */
export async function migrateStorage(stores: Stores): Promise<{ from: number; to: number }> {
  const stored = (await stores.local.get(STORAGE_VERSION_KEY))[STORAGE_VERSION_KEY];
  const from = typeof stored === 'number' && Number.isInteger(stored) && stored >= 0 ? stored : 0;
  let version = from;
  for (const step of MIGRATIONS) {
    if (step.version <= version) continue;
    await step.run(stores);
    version = step.version;
    await stores.local.set({ [STORAGE_VERSION_KEY]: version });
  }
  return { from, to: version };
}
