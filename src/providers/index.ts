import type { SourceId } from '../core/types';
import { rolimons } from './rolimons';
import { routility } from './routility';
import type { ValueProvider } from './types';

export const PROVIDERS: Record<SourceId, ValueProvider> = { rolimons, routility };

/** The requested provider, or Rolimons when it isn't usable. */
export function resolveProvider(id: SourceId): ValueProvider {
  const provider = PROVIDERS[id];
  return provider.available ? provider : rolimons;
}

export type { ValueProvider };
