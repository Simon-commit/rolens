import { STALE_AFTER_MS } from '../core/cache';
import { initAlerts } from './alerts';
import { formatAge } from '../core/format';
import { send, type CacheStatus } from '../core/messages';
import { ROUTILITY_BACKOFF_MS } from '../core/routility-cache';
import { normaliseSettings, type Settings, type ThemePreference } from '../core/settings';
import { SOURCES } from '../core/sources';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

let settings: Settings;

async function save(patch: Partial<Settings>): Promise<void> {
  settings = { ...settings, ...patch };
  await chrome.storage.sync.set({ settings });
}

function renderStatus(status: CacheStatus | undefined): void {
  const card = $('#status-card');
  const title = $('#status');
  const sub = $('#status-sub');
  $('#refresh').hidden = !settings.useRolimons;
  if (!status) {
    card.dataset.state = 'error';
    title.textContent = 'RoLens is unavailable';
    sub.textContent = 'Reload the extension to restore the connection';
    return;
  }
  if (!settings.useRolimons) {
    const routility = status.routility;
    title.textContent = 'RoUtility values';
    if (routility?.blockedUntil || (routility?.error && !routility.lastSuccess)) {
      sub.textContent = 'RoUtility is not responding';
      card.dataset.state = 'error';
    } else {
      sub.textContent = routility?.lastSuccess
        ? `Updated ${formatAge(routility.lastSuccess)}`
        : 'Values load as you browse Roblox';
      card.dataset.state = routility?.lastSuccess ? 'fresh' : 'stale';
    }
    return;
  }
  const label = SOURCES.rolimons.label;
  if (status.fetchedAt) {
    title.textContent = `${status.itemCount.toLocaleString()} ${status.itemCount === 1 ? 'item' : 'items'} tracked`;
    sub.textContent = status.error
      ? `Update failed: ${status.error}`
      : `${label} · Updated ${formatAge(status.fetchedAt)}`;
    card.dataset.state = status.error ? 'error' : Date.now() - status.fetchedAt > STALE_AFTER_MS ? 'stale' : 'fresh';
  } else {
    title.textContent = status.error ? 'Values could not be loaded' : 'Loading values…';
    sub.textContent = status.error ?? `Connecting to ${label}…`;
    card.dataset.state = status.error ? 'error' : 'stale';
  }
}

function paintBadge(badge: HTMLElement, text: string, tone: string, title = ''): void {
  badge.textContent = text;
  badge.className = `badge ${tone}`.trim();
  badge.title = title;
}

function renderRolimonsStatus(status: CacheStatus | undefined): void {
  const badge = $('#rolimons-badge');
  if (!settings.useRolimons) paintBadge(badge, 'Off', 'is-idle');
  else if (status?.error && !status.fetchedAt)
    paintBadge(badge, 'Unavailable', 'is-bad', `Last error: ${status.error}`);
  else if (status?.fetchedAt) paintBadge(badge, 'Connected', '');
  else paintBadge(badge, 'Connecting', 'is-idle');
}

function renderRoutilityStatus(status: CacheStatus | undefined): void {
  const badge = $('#routility-badge');
  const routility = status?.routility;
  const title = routility?.error ? `Last error: ${routility.error}` : '';
  if (!settings.useRoutility) paintBadge(badge, 'Off', 'is-idle');
  else if (routility?.blockedUntil) {
    paintBadge(
      badge,
      'Paused',
      'is-bad',
      `RoUtility declined recent requests. RoLens pauses for ${ROUTILITY_BACKOFF_MS / 60_000} minutes before trying again.`,
    );
  } else if (routility?.error && !routility.lastSuccess) paintBadge(badge, 'Unavailable', 'is-bad', title);
  else if (routility?.lastSuccess) paintBadge(badge, 'Connected', '', title);
  else paintBadge(badge, 'Ready', 'is-idle', 'Data is requested for items as they appear on Roblox');
}

/** Two source switches; whichever is the only one left on can't be turned off. */
function renderSources(): void {
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input[data-source]')];
  const paint = () => {
    const onCount = inputs.filter((input) => settings[input.dataset.source as 'useRolimons' | 'useRoutility']).length;
    for (const input of inputs) {
      input.checked = settings[input.dataset.source as 'useRolimons' | 'useRoutility'];
      input.disabled = input.checked && onCount === 1;
      input.title = input.disabled ? 'At least one source must remain enabled' : '';
    }
    $('#source-note').hidden = onCount > 1;
    $('#usd-note').textContent = settings.useRoutility
      ? 'RoUtility estimates, or the fallback rate'
      : 'Calculated at the fallback rate';
  };
  for (const input of inputs) {
    input.addEventListener('change', () => {
      void save({ [input.dataset.source as 'useRolimons' | 'useRoutility']: input.checked })
        .then(paint)
        .then(refreshStatus);
    });
  }
  paint();
}

function renderToggles(): void {
  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
    const key = input.dataset.setting as
      | 'showBadges'
      | 'showTradeTotals'
      | 'showTradePreviews'
      | 'warnDuplicateTrades'
      | 'showCancelTools'
      | 'showTradeWindowTools'
      | 'showTradeHistory'
      | 'showProfileValue'
      | 'showItemPanel'
      | 'showUsd'
      | 'darkRoblox'
      | 'hideSerials'
      | 'colorBlind';
    input.checked = settings[key];
    input.addEventListener('change', () => void save({ [key]: input.checked }));
  }
}

/** Names the serial shortcut as the user has it set, or says none is assigned. */
function renderSerialShortcut(): void {
  void chrome.commands.getAll().then((commands) => {
    const shortcut = commands.find((command) => command.name === 'toggle-serials')?.shortcut;
    if (shortcut) $('#serials-note').textContent = `Blurs Limited U serials · ${shortcut}`;
  });
}

function renderFormat(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-format]');
  const paint = () => {
    for (const button of buttons) {
      button.setAttribute('aria-checked', String((button.dataset.format === 'compact') === settings.compactNumbers));
    }
    $('#format-example').textContent = settings.compactNumbers ? 'Abbreviated for quick reading' : 'Full figures';
  };
  for (const button of buttons) {
    button.addEventListener('click', () => {
      void save({ compactNumbers: button.dataset.format === 'compact' }).then(paint);
    });
  }
  paint();
}

function renderRate(): void {
  const input = $<HTMLInputElement>('#usd-rate');
  input.value = settings.usdRate === null ? '' : String(settings.usdRate);
  input.addEventListener('change', () => {
    const rate = Number(input.value);
    const valid = input.value.trim() !== '' && Number.isFinite(rate) && rate > 0 && rate < 1000;
    if (!valid) input.value = '';
    void save({ usdRate: valid ? rate : null });
  });
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(): void {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && systemDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function renderTheme(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]');
  const notes: Record<ThemePreference, string> = {
    auto: 'Follows Roblox',
    light: 'Always light',
    dark: 'Always dark',
  };
  const paint = () => {
    for (const button of buttons) {
      button.setAttribute('aria-checked', String(button.dataset.themeChoice === settings.theme));
    }
    $('#theme-note').textContent = notes[settings.theme];
    applyTheme();
  };
  for (const button of buttons) {
    button.addEventListener(
      'click',
      () => void save({ theme: button.dataset.themeChoice as ThemePreference }).then(paint),
    );
  }
  systemDark.addEventListener('change', applyTheme);
  paint();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('ready')));
}

function renderAllStatus(status: CacheStatus | undefined): void {
  renderStatus(status);
  renderRolimonsStatus(status);
  renderRoutilityStatus(status);
}

async function refreshStatus(): Promise<void> {
  renderAllStatus(await send({ type: 'rolens:getStatus' }).catch(() => undefined));
}

const TAB_KEY = 'rolens:tab';
const TABS = ['features', 'alerts', 'display', 'sources'] as const;
type Tab = (typeof TABS)[number];

/** Four tabs keep the popup short. The last one used is reopened; popup.html#alerts opens a given tab. */
function renderTabs(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const show = (tab: Tab, focus = false) => {
    for (const button of buttons) {
      const selected = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
      $(`#panel-${button.dataset.tab}`).hidden = !selected;
    }
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      // Remembering the tab is a convenience only.
    }
  };
  for (const [i, button] of buttons.entries()) {
    button.addEventListener('click', () => show(button.dataset.tab as Tab));
    button.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      show(buttons[(i + step + buttons.length) % buttons.length]!.dataset.tab as Tab, true);
    });
  }
  let initial: string | null = location.hash.slice(1);
  if (!initial) {
    try {
      initial = localStorage.getItem(TAB_KEY);
    } catch {
      initial = null;
    }
  }
  show(TABS.includes(initial as Tab) ? (initial as Tab) : 'features');
}

async function main(): Promise<void> {
  const stored = await chrome.storage.sync.get('settings');
  settings = normaliseSettings(stored.settings);
  renderTheme();
  renderSources();
  renderToggles();
  renderSerialShortcut();
  renderFormat();
  renderRate();
  renderTabs();
  void initAlerts();

  const refresh = $<HTMLButtonElement>('#refresh');
  refresh.addEventListener('click', () => {
    refresh.disabled = true;
    refresh.classList.add('is-spinning');
    void send({ type: 'rolens:refresh' })
      .catch(() => undefined)
      .then((status) => {
        renderAllStatus(status);
        refresh.disabled = false;
        refresh.classList.remove('is-spinning');
      });
  });

  const clear = $<HTMLButtonElement>('#clear-cache');
  clear.addEventListener('click', () => {
    clear.disabled = true;
    void send({ type: 'rolens:clearCache' })
      .catch(() => undefined)
      .then((status) => {
        renderAllStatus(status);
        clear.textContent = 'Cleared';
        $('#clear-note').textContent = 'Saved trades and estimates removed';
      });
  });

  await refreshStatus();
}

void main();
