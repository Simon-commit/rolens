import { summariseInventory } from '../core/inventory';
import type { PlayerResponse } from '../core/messages';
import type { PlayerInventory } from '../core/player';
import { effectiveValue, type ItemValue } from '../core/types';
import { itemThumbnails } from './roblox-api';
import { SELECTORS } from './selectors';
import type { RenderContext } from './ui/context';
import { openInventoryPanel } from './ui/inventory-panel';
import { renderProfileBox, type ProfileBoxState } from './ui/profile-box';

/** How many of the most valuable items get RoUtility USD figures; the rest use the fallback rate. */
export const ROUTILITY_TOP = 24;

export interface ProfileDeps {
  getPlayer: (userId: number) => Promise<PlayerResponse | undefined>;
  loadValues: (ids: number[]) => Promise<void>;
  /** Fetches RoUtility figures; resolves true when any arrived. */
  loadRoutility: (ids: number[]) => Promise<boolean>;
  lookup: (id: number) => ItemValue | null | undefined;
  /** Asks for another scan, e.g. when data arrived. */
  redraw: () => void;
}

type Load =
  { status: 'pending' } | { status: 'done'; inventory: PlayerInventory } | { status: 'failed'; message: string };

const loads = new Map<number, Load>();
const routilityAsked = new Set<number>();
/** The box keeps the handlers it was created with, so they defer to the latest render's. */
let actions = { open: () => {}, retry: () => {} };
const stableActions = { open: () => actions.open(), retry: () => actions.retry() };

function request(userId: number, deps: ProfileDeps): void {
  loads.set(userId, { status: 'pending' });
  void deps
    .getPlayer(userId)
    .catch(() => undefined)
    .then((response) => {
      if (!response) loads.set(userId, { status: 'failed', message: 'RoLens could not reach its background service.' });
      else if ('error' in response) loads.set(userId, { status: 'failed', message: response.error });
      else loads.set(userId, { status: 'done', inventory: response.inventory });
      deps.redraw();
    });
}

/** Where the box goes: after the profile header, or at the top of the profile. */
function placeBox(host: HTMLElement): boolean {
  const header = document.querySelector(SELECTORS.profileHeader);
  if (header?.parentElement) {
    if (header.nextElementSibling !== host) header.after(host);
    return true;
  }
  const container = document.querySelector(SELECTORS.profileContainer);
  if (!container) return false;
  if (container.firstElementChild !== host) container.prepend(host);
  return true;
}

function playerName(): string {
  for (const node of document.querySelectorAll(SELECTORS.profileName)) {
    const text = node.textContent?.trim().replace(/^@/, '');
    if (text) return text;
  }
  return 'Player';
}

/**
 * Draws the RoLens box on a profile and keeps it current. The inventory is requested once
 * per player and page; values for its items come through the same store as every chip.
 */
export async function renderProfile(userId: number, ctx: RenderContext, deps: ProfileDeps): Promise<void> {
  const existing = document.querySelector<HTMLElement>('[data-rolens="profile"]');
  let state: ProfileBoxState;
  let counts: Record<string, number> | null = null;
  let scannedAt: number | null = null;

  if (!ctx.settings.useRolimons) state = { kind: 'needs-rolimons' };
  else {
    let load = loads.get(userId);
    if (!load) {
      request(userId, deps);
      load = loads.get(userId)!;
    }
    if (load.status === 'pending') state = { kind: 'loading' };
    else if (load.status === 'failed') state = { kind: 'error', message: load.message };
    else if (load.inventory.status !== 'ok') state = { kind: load.inventory.status };
    else {
      counts = load.inventory.counts;
      scannedAt = load.inventory.scannedAt;
      state = { kind: 'loading' };
    }
  }

  if (counts) {
    const ids = Object.keys(counts).map(Number);
    await deps.loadValues(ids);
    const summary = summariseInventory(counts, deps.lookup, ctx.settings);
    state = summary.copies === 0 && summary.unlisted === 0 ? { kind: 'empty' } : { kind: 'ready', summary, scannedAt };

    if (ctx.settings.useRoutility) {
      const top = summary.entries
        .filter(({ item }) => !item.routility)
        .sort((a, b) => effectiveValue(b.item) - effectiveValue(a.item))
        .slice(0, ROUTILITY_TOP)
        .map(({ item }) => item.id)
        .filter((id) => !routilityAsked.has(id));
      if (top.length) {
        for (const id of top) routilityAsked.add(id);
        void deps.loadRoutility(top).then((changed) => changed && deps.redraw());
      }
    }
  }

  const shown = state;
  actions = {
    open: () => {
      if (shown.kind !== 'ready') return;
      openInventoryPanel({
        playerName: playerName(),
        userId,
        summary: shown.summary,
        scannedAt: shown.scannedAt,
        ctx,
        loadThumbnails: (ids) => itemThumbnails(ids),
      });
    },
    retry: () => {
      request(userId, deps);
      deps.redraw();
    },
  };
  const host = renderProfileBox(existing, state, ctx, stableActions);
  if (!placeBox(host)) host.remove();
}

/** Forgets fetched inventories, e.g. when the source settings change. */
export function resetProfiles(): void {
  loads.clear();
  routilityAsked.clear();
}
