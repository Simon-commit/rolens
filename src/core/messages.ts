import type { PlayerInventory } from './player';
import type { RoutilityStatus } from './routility-cache';
import type { ItemValue, RoutilityData, SourceId } from './types';

/** Messages content scripts and the popup send to the service worker. */
export type Request =
  | { type: 'rolens:getItems'; ids: number[] }
  | { type: 'rolens:getRoutility'; ids: number[] }
  | { type: 'rolens:getPlayer'; userId: number }
  | { type: 'rolens:findByName'; names: string[] }
  | { type: 'rolens:getStatus' }
  | { type: 'rolens:refresh' }
  | { type: 'rolens:clearCache' }
  | { type: 'rolens:testAlert' };

export interface CacheStatus {
  source: SourceId;
  fetchedAt: number | null;
  itemCount: number;
  /** Last fetch error, kept until a fetch succeeds. */
  error: string | null;
  routility?: RoutilityStatus;
}

export interface RoutilityResponse {
  items: Record<string, RoutilityData | null>;
  status: RoutilityStatus;
}

/** Destinations a test alert could not reach; empty when all were reached. */
export interface TestAlertResponse {
  failures: string[];
  /** False when no destination is set up. */
  sent: boolean;
}

/** A player's inventory, or why it couldn't be fetched. */
export type PlayerResponse = { inventory: PlayerInventory } | { error: string };

export interface ItemsResponse {
  items: Record<string, ItemValue>;
  status: CacheStatus;
}

/** Items found by name, keyed by the name as it was asked. Names that match no limited, or several, are left out. */
export interface NamesResponse {
  items: Record<string, ItemValue>;
  status: CacheStatus;
}

export const MAX_NAMES = 200;
const MAX_NAME_LENGTH = 200;

export type ResponseFor<R extends Request> = R extends { type: 'rolens:getItems' }
  ? ItemsResponse
  : R extends { type: 'rolens:findByName' }
    ? NamesResponse
    : R extends { type: 'rolens:getRoutility' }
      ? RoutilityResponse
      : R extends { type: 'rolens:getPlayer' }
        ? PlayerResponse
        : R extends { type: 'rolens:testAlert' }
          ? TestAlertResponse
          : CacheStatus;

export function isRequest(message: unknown): message is Request {
  if (typeof message !== 'object' || message === null) return false;
  const { type, ids } = message as { type?: unknown; ids?: unknown };
  if (
    type === 'rolens:getStatus' ||
    type === 'rolens:refresh' ||
    type === 'rolens:clearCache' ||
    type === 'rolens:testAlert'
  ) {
    return true;
  }
  if (type === 'rolens:findByName') {
    const { names } = message as { names?: unknown };
    return (
      Array.isArray(names) &&
      names.length <= MAX_NAMES &&
      names.every((name) => typeof name === 'string' && name.length > 0 && name.length <= MAX_NAME_LENGTH)
    );
  }
  if (type === 'rolens:getPlayer') {
    const { userId } = message as { userId?: unknown };
    return typeof userId === 'number' && Number.isSafeInteger(userId) && userId > 0;
  }
  return (
    (type === 'rolens:getItems' || type === 'rolens:getRoutility') &&
    Array.isArray(ids) &&
    ids.length <= 1000 &&
    ids.every((id) => Number.isSafeInteger(id) && id > 0)
  );
}

export function send<R extends Request>(request: R): Promise<ResponseFor<R>> {
  return chrome.runtime.sendMessage(request);
}
