import type { CacheStatus } from '../../core/messages';
import type { Settings } from '../../core/settings';
import type { ItemValue } from '../../core/types';

/** Everything a widget needs besides the item itself. */
export interface RenderContext {
  settings: Settings;
  status: CacheStatus | null;
  /** Remembers whether the trade bar is expanded. Absent in tests. */
  saveTradeDetails?: (expanded: boolean) => void;
}

/** Changes whenever anything a widget shows for this item changes, so it gets rebuilt. */
export function renderKey(item: ItemValue): string {
  return JSON.stringify([
    item.id,
    item.value,
    item.rap,
    item.usd?.value ?? null,
    item.usd?.confidence ?? null,
    item.rare,
    item.projected,
    item.routility?.value ?? null,
  ]);
}
