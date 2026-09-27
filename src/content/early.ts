import { normaliseSettings } from '../core/settings';
import { setRobloxDark, watchRobloxTheme } from './roblox-dark';

/*
 * Runs at document_start, before Roblox paints, so the optional dark mode applies
 * without a flash of the light page. Everything else waits for the main content script.
 */
void chrome.storage.sync.get('settings').then(({ settings }) => {
  setRobloxDark(normaliseSettings(settings).darkRoblox);
  watchRobloxTheme();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) setRobloxDark(normaliseSettings(changes.settings.newValue).darkRoblox);
});
