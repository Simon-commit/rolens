import { DEMANDS, TRENDS, type ItemValue } from './types';

/**
 * Parser for the public Rolimon's item details endpoint.
 *
 * Each item is a positional array:
 * [name, acronym, rap, value, defaultValue, demand, trend, projected, hyped, rare, ...]
 * where -1 means "none" for numbers and enums, and "false" for flags.
 * Later indices are ignored so new fields added upstream don't break parsing.
 */

export const ROLIMONS_ITEMS_URL = 'https://api.rolimons.com/items/v2/itemdetails';

export class RolimonsParseError extends Error {
  override name = 'RolimonsParseError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function pick<T>(table: readonly T[], value: unknown): T | null {
  const index = num(value);
  return index === null ? null : (table[index] ?? null);
}

export function parseRolimonsItem(id: number, row: unknown): ItemValue | null {
  if (!Array.isArray(row) || row.length < 10) return null;
  const name = str(row[0]);
  if (!name) return null;
  return {
    id,
    name,
    acronym: str(row[1]),
    rap: num(row[2]) ?? 0,
    value: num(row[3]),
    demand: pick(DEMANDS, row[5]),
    trend: pick(TRENDS, row[6]),
    projected: row[7] === 1,
    hyped: row[8] === 1,
    rare: row[9] === 1,
  };
}

/** Validates and normalises a raw response body. Malformed rows are skipped, not fatal. */
export function parseRolimonsItems(body: unknown): Record<string, ItemValue> {
  if (!isRecord(body) || body.success !== true || !isRecord(body.items)) {
    throw new RolimonsParseError("Rolimon's returned an unexpected response");
  }
  const items: Record<string, ItemValue> = {};
  for (const [key, row] of Object.entries(body.items)) {
    const id = Number(key);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const item = parseRolimonsItem(id, row);
    if (item) items[key] = item;
  }
  if (Object.keys(items).length === 0) {
    throw new RolimonsParseError("Rolimon's returned no usable items");
  }
  return items;
}

/** Downloads and parses the full value table. Never sends cookies. */
export async function fetchRolimonsItems(fetchFn: typeof fetch): Promise<Record<string, ItemValue>> {
  const response = await fetchFn(ROLIMONS_ITEMS_URL, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`Rolimon's could not be reached (HTTP ${response.status})`);
  return parseRolimonsItems(await response.json());
}
