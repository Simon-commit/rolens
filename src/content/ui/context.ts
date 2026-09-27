import type { CacheStatus } from '../../core/messages';
import type { Settings } from '../../core/settings';
import type { ValueProvider } from '../../providers/types';

/** Everything a widget needs besides the item itself. */
export interface RenderContext {
  settings: Settings;
  provider: ValueProvider;
  status: CacheStatus | null;
  /** Remembers whether the trade bar is expanded. Absent in tests. */
  saveTradeDetails?: (expanded: boolean) => void;
}
