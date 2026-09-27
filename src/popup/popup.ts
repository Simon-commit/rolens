import { formatAge } from '../core/format';
import { send, type CacheStatus } from '../core/messages';
import { normaliseSettings, type Settings, type ThemePreference } from '../core/settings';
import { STALE_AFTER_MS } from '../core/cache';
import { PROVIDERS } from '../providers';

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
  if (!status) {
    card.dataset.state = 'error';
    title.textContent = 'Background worker unavailable';
    sub.textContent = 'Try reloading the extension.';
    return;
  }
  const label = PROVIDERS[status.source].label;
  if (status.fetchedAt) {
    title.textContent = `${status.itemCount.toLocaleString()} items tracked`;
    sub.textContent = status.error
      ? `Refresh failed: ${status.error}`
      : `${label} · updated ${formatAge(status.fetchedAt)}`;
    card.dataset.state = status.error ? 'error' : Date.now() - status.fetchedAt > STALE_AFTER_MS ? 'stale' : 'fresh';
  } else {
    title.textContent = status.error ? 'Could not load values' : 'No data yet';
    sub.textContent = status.error ?? `Waiting for ${label}`;
    card.dataset.state = status.error ? 'error' : 'stale';
  }
}

function renderSources(): void {
  const container = $('#sources');
  container.replaceChildren();
  for (const provider of Object.values(PROVIDERS)) {
    const row = document.createElement('label');
    row.className = provider.available ? 'setting' : 'setting is-disabled';
    const left = document.createElement('span');
    left.className = 'source-left';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'source';
    input.value = provider.id;
    input.disabled = !provider.available;
    input.checked = settings.source === provider.id;
    input.addEventListener('change', () => void save({ source: provider.id }).then(refreshStatus));
    const text = document.createElement('span');
    text.style.display = 'grid';
    const name = document.createElement('b');
    name.textContent = provider.label;
    const note = document.createElement('small');
    note.textContent = provider.available ? 'Values, RAP, demand, trend' : 'USD values and confidence';
    text.append(name, note);
    left.append(input, text);
    const badge = document.createElement('span');
    badge.className = provider.available ? 'badge' : 'badge is-soon';
    badge.textContent = provider.available ? 'Connected' : 'Coming soon';
    if (provider.unavailableReason) badge.title = provider.unavailableReason;
    row.append(left, badge);
    container.append(row);
  }
}

function renderToggles(): void {
  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
    const key = input.dataset.setting as 'showBadges' | 'showTradeTotals' | 'showItemPanel' | 'showUsd';
    input.checked = settings[key];
    input.addEventListener('change', () => void save({ [key]: input.checked }));
  }
}

function renderFormat(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-format]');
  const paint = () => {
    for (const button of buttons) {
      button.setAttribute('aria-checked', String((button.dataset.format === 'compact') === settings.compactNumbers));
    }
    $('#format-example').textContent = settings.compactNumbers ? 'Short, easy to scan' : 'Every digit';
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
    auto: 'Follows Roblox and your system',
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

async function refreshStatus(): Promise<void> {
  renderStatus(await send({ type: 'rolens:getStatus' }).catch(() => undefined));
}

async function main(): Promise<void> {
  const stored = await chrome.storage.sync.get('settings');
  settings = normaliseSettings(stored.settings);
  renderTheme();
  renderSources();
  renderToggles();
  renderFormat();
  renderRate();

  const refresh = $<HTMLButtonElement>('#refresh');
  refresh.addEventListener('click', () => {
    refresh.disabled = true;
    refresh.classList.add('is-spinning');
    void send({ type: 'rolens:refresh' })
      .catch(() => undefined)
      .then((status) => {
        renderStatus(status);
        refresh.disabled = false;
        refresh.classList.remove('is-spinning');
      });
  });

  await refreshStatus();
}

void main();
