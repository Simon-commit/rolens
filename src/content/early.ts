import { normaliseSettings } from '../core/settings';
import { setRobloxDark, watchRobloxTheme } from './roblox-dark';
import { setSerialsHidden } from './serials';

/*
 * Runs at document_start, before Roblox paints, so the optional dark mode applies
 * without a flash of the light page, and hidden serials are blurred before they are painted. Everything else waits for the main content script.
 */
void chrome.storage.sync.get('settings').then(({ settings }) => {
  const current = normaliseSettings(settings);
  setRobloxDark(current.darkRoblox);
  watchRobloxTheme();
  setSerialsHidden(current.hideSerials);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.settings) return;
  const next = normaliseSettings(changes.settings.newValue);
  setRobloxDark(next.darkRoblox);
  setSerialsHidden(next.hideSerials);
});
