import { fetchPlayerInventory, type PlayerInventory } from './player';

/** How long a player's inventory is reused before asking Rolimon's again. */
export const PLAYER_TTL_MS = 5 * 60_000;
/** Minimum gap between player requests, so browsing profiles quickly can't flood Rolimon's. */
export const PLAYER_MIN_GAP_MS = 2_000;
/** After Rolimon's declines a request, wait this long before trying again. */
export const PLAYER_BACKOFF_MS = 60_000;
const MAX_ENTRIES = 50;

/**
 * Fetches player inventories one at a time, spaced out, with a small in-memory cache.
 * Only the profile being viewed is requested.
 */
export class PlayerCache {
  private readonly entries = new Map<number, { inventory: PlayerInventory; fetchedAt: number }>();
  private readonly inFlight = new Map<number, Promise<PlayerInventory>>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequest = 0;
  private blockedUntil = 0;

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
  ) {}

  /** Forgets every inventory read so far. */
  clear(): void {
    this.entries.clear();
  }

  get(userId: number): Promise<PlayerInventory> {
    const cached = this.entries.get(userId);
    if (cached && this.now() - cached.fetchedAt < PLAYER_TTL_MS) return Promise.resolve(cached.inventory);
    const running = this.inFlight.get(userId);
    if (running) return running;
    const task = this.enqueue(userId).finally(() => this.inFlight.delete(userId));
    this.inFlight.set(userId, task);
    return task;
  }

  private enqueue(userId: number): Promise<PlayerInventory> {
    const task = this.queue.then(async () => {
      if (this.blockedUntil > this.now())
        throw new Error("Rolimon's is limiting requests. Please try again in a minute.");
      const gap = this.lastRequest + PLAYER_MIN_GAP_MS - this.now();
      if (gap > 0) await this.wait(gap);
      this.lastRequest = this.now();
      try {
        const inventory = await fetchPlayerInventory(userId, this.fetchFn);
        this.remember(userId, inventory);
        return inventory;
      } catch (error) {
        if (error instanceof Error && /HTTP (403|503)|limiting requests/.test(error.message)) {
          this.blockedUntil = this.now() + PLAYER_BACKOFF_MS;
        }
        throw error;
      }
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  private remember(userId: number, inventory: PlayerInventory): void {
    this.entries.delete(userId);
    this.entries.set(userId, { inventory, fetchedAt: this.now() });
    if (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
  }
}
