/**
 * A player's limited inventory from Rolimon's public player API.
 *
 * Rolimon's scans inventories on its own schedule, so what it returns is a recent copy
 * rather than a live one; `scannedAt` says how recent. The response is parsed
 * defensively: anything unexpected means "no data", never an error on the page.
 */

export const rolimonsPlayerUrl = (userId: number) => `https://api.rolimons.com/players/v1/playerassets/${userId}`;

export type PlayerInventory =
  | {
      status: 'ok';
      userId: number;
      /** Copies owned of each limited, by item id. */
      counts: Record<string, number>;
      /** Epoch milliseconds of Rolimon's last scan, when it says. */
      scannedAt: number | null;
      /** Copies Roblox holds from trading (recently acquired items), by item id. */
      held: number;
    }
  | { status: 'private' | 'terminated' | 'unknown'; userId: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rolimon's reports scan times in epoch seconds. */
function time(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * 1000 : null;
}

export function parsePlayerAssets(body: unknown, userId: number): PlayerInventory {
  if (!isRecord(body) || body.success !== true) return { status: 'unknown', userId };
  if (body.playerTerminated === true) return { status: 'terminated', userId };
  if (body.playerPrivacyEnabled === true) return { status: 'private', userId };
  if (!isRecord(body.playerAssets)) return { status: 'unknown', userId };
  const counts: Record<string, number> = {};
  for (const [key, copies] of Object.entries(body.playerAssets)) {
    const id = Number(key);
    if (!Number.isSafeInteger(id) || id <= 0 || !Array.isArray(copies) || copies.length === 0) continue;
    counts[key] = copies.length;
  }
  return {
    status: 'ok',
    userId,
    counts,
    scannedAt: time(body.chartNominalScanTime),
    held: Array.isArray(body.holds) ? body.holds.length : 0,
  };
}

/** Fetches one player's inventory. Never sends cookies. */
export async function fetchPlayerInventory(userId: number, fetchFn: typeof fetch): Promise<PlayerInventory> {
  let response: Response;
  try {
    response = await fetchFn(rolimonsPlayerUrl(userId), { credentials: 'omit', cache: 'no-store' });
  } catch {
    throw new Error("Rolimon's could not be reached. Please check your connection and try again.");
  }
  if (response.status === 404) return { status: 'unknown', userId };
  if (response.status === 429) throw new Error("Rolimon's is limiting requests. Please try again in a minute.");
  if (!response.ok) throw new Error(`Rolimon's could not be reached (HTTP ${response.status}).`);
  return parsePlayerAssets(await response.json(), userId);
}
