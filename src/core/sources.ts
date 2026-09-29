import type { Settings } from './settings';
import type { SourceId } from './types';

/** How each value source is named and linked in RoLens. */
export const SOURCES: Record<SourceId, { label: string; homepage: string; itemUrl: (id: number) => string }> = {
  rolimons: {
    label: "Rolimon's",
    homepage: 'https://www.rolimons.com',
    itemUrl: (id) => `https://www.rolimons.com/item/${id}`,
  },
  routility: {
    label: 'RoUtility',
    homepage: 'https://routility.io',
    itemUrl: (id) => `https://routility.io/catalog/${id}`,
  },
};

/** The enabled sources, in display order. At least one is always enabled. */
export function enabledSources(settings: Settings): SourceId[] {
  const ids: SourceId[] = [];
  if (settings.useRolimons) ids.push('rolimons');
  if (settings.useRoutility) ids.push('routility');
  return ids;
}

/** "Rolimon's", "RoUtility" or "Rolimon's and RoUtility". */
export function sourceNames(ids: readonly SourceId[]): string {
  return ids.map((id) => SOURCES[id].label).join(' and ');
}
