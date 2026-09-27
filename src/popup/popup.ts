import { formatAge } from '../core/format';
import { send, type CacheStatus } from '../core/messages';
import { normaliseSettings, type Settings } from '../core/settings';
import { PROVIDERS } from '../providers';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

let settings: Settings;

async function save(patch: Partial<Settings>): Promise<void> {
  settings = { ...settings, ...patch };
  await chrome.storage.sync.set({ settings });
}

function renderStatus(status: CacheStatus | undefined): void {
  const statusEl = $('#status');
  const errorEl = $('#error');
  if (!status) {
    statusEl.textContent = 'Could not reach the background worker.';
    return;
  }
  const label = PROVIDERS[status.source].label;
  statusEl.textContent = status.fetchedAt
    ? `${status.itemCount.toLocaleString()} items from ${label}, updated ${formatAge(status.fetchedAt)}.`
    : `No data from ${label} yet.`;
  errorEl.hidden = !status.error;
  errorEl.textContent = status.error ? `Last refresh failed: ${status.error}` : '';
}

function renderSources(): void {
  const container = $('#sources');
  container.replaceChildren();
  for (const provider of Object.values(PROVIDERS)) {
    const label = document.createElement('label');
    label.className = provider.available ? 'source' : 'source is-disabled';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'source';
    input.value = provider.id;
    input.disabled = !provider.available;
    input.checked = settings.source === provider.id;
    input.addEventListener('change', () => {
      void save({ source: provider.id }).then(refreshStatus);
    });
    const text = document.createElement('span');
    text.textContent = provider.label;
    if (provider.unavailableReason) {
      const note = document.createElement('small');
      note.textContent = provider.unavailableReason;
      text.append(note);
    }
    label.append(input, text);
    container.append(label);
  }
}

function renderToggles(): void {
  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
    const key = input.dataset.setting as keyof Settings;
    input.checked = Boolean(settings[key]);
    input.addEventListener('change', () => void save({ [key]: input.checked }));
  }
}

async function refreshStatus(): Promise<void> {
  renderStatus(await send({ type: 'rolens:getStatus' }).catch(() => undefined));
}

async function main(): Promise<void> {
  const stored = await chrome.storage.sync.get('settings');
  settings = normaliseSettings(stored.settings);
  renderSources();
  renderToggles();

  const refresh = $<HTMLButtonElement>('#refresh');
  refresh.addEventListener('click', () => {
    refresh.disabled = true;
    refresh.textContent = 'Refreshing…';
    void send({ type: 'rolens:refresh' })
      .catch(() => undefined)
      .then((status) => {
        renderStatus(status);
        refresh.disabled = false;
        refresh.textContent = 'Refresh';
      });
  });

  await refreshStatus();
}

void main();
