import type { RoutilityStatus } from './routility-cache';
import type { ItemValue, RoutilityData, SourceId } from './types';

/** Messages content scripts and the popup send to the service worker. */
export type Request =
  | { type: 'rolens:getItems'; ids: number[] }
  | { type: 'rolens:getRoutility'; ids: number[] }
  | { type: 'rolens:getStatus' }
  | { type: 'rolens:refresh' };

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

export interface ItemsResponse {
  items: Record<string, ItemValue>;
  status: CacheStatus;
}

export type ResponseFor<R extends Request> = R extends { type: 'rolens:getItems' }
  ? ItemsResponse
  : R extends { type: 'rolens:getRoutility' }
    ? RoutilityResponse
    : CacheStatus;

export function isRequest(message: unknown): message is Request {
  if (typeof message !== 'object' || message === null) return false;
  const { type, ids } = message as { type?: unknown; ids?: unknown };
  if (type === 'rolens:getStatus' || type === 'rolens:refresh') return true;
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
