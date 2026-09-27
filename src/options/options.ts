import {
  ALERT_STATE_KEY,
  ALERTS_KEY,
  DISCORD_ORIGIN,
  isDiscordUserId,
  isNtfyTopic,
  normaliseAlerts,
  normaliseWebhook,
  NTFY_ORIGIN,
  ROBLOX_TRADES_ORIGIN,
  type AlertSettings,
} from '../core/alerts';
import type { CheckResult } from '../background/inbound-alerts';
import { formatAge } from '../core/format';
import { send } from '../core/messages';
import { normaliseSettings } from '../core/settings';

/*
 * The inbound trade alerts page. Every permission is requested here, at the moment the
 * user turns on the feature that needs it, and returned when it is turned off again.
 */

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

let alerts: AlertSettings;

async function save(patch: Partial<AlertSettings>): Promise<void> {
  alerts = { ...alerts, ...patch };
  await chrome.storage.local.set({ [ALERTS_KEY]: alerts });
}

const request = (permissions: chrome.permissions.Permissions) =>
  chrome.permissions.request(permissions).catch(() => false);
const release = (permissions: chrome.permissions.Permissions) =>
  chrome.permissions.remove(permissions).catch(() => false);

function note(selector: string, text: string, tone?: 'good' | 'bad'): void {
  const node = $(selector);
  node.textContent = text;
  node.className = `field-note${tone ? ` is-${tone}` : ''}`;
}

const ALERT_PERMISSIONS: chrome.permissions.Permissions = { permissions: ['alarms'], origins: [ROBLOX_TRADES_ORIGIN] };

/**
 * A destination's permissions, plus what alerts themselves need while they are off, so one
 * Chrome prompt covers both and saving a destination turns alerts on.
 */
function withAlerts(needed: chrome.permissions.Permissions): chrome.permissions.Permissions {
  if (alerts.enabled) return needed;
  return {
    permissions: [...(needed.permissions ?? []), ...ALERT_PERMISSIONS.permissions!],
    origins: [...(needed.origins ?? []), ...ALERT_PERMISSIONS.origins!],
  };
}

/** Turns alerts on once their permissions are granted. */
async function turnOn(): Promise<void> {
  if (alerts.enabled) return;
  // Start fresh: trades already waiting are not new, whatever happened while alerts were off.
  await chrome.storage.local.remove(ALERT_STATE_KEY);
  await save({ enabled: true });
  $<HTMLInputElement>('#enabled').checked = true;
  await renderState();
}

async function requestAndTurnOn(): Promise<boolean> {
  // Requested from the click itself, as Chrome requires.
  if (!(await request(ALERT_PERMISSIONS))) return false;
  await turnOn();
  return true;
}

function renderSwitches(): void {
  const enabled = $<HTMLInputElement>('#enabled');
  enabled.checked = alerts.enabled;
  enabled.addEventListener('change', () => {
    void (async () => {
      if (enabled.checked) {
        if (!(await requestAndTurnOn())) enabled.checked = false;
        return;
      }
      await save({ enabled: false });
      await release({ origins: [ROBLOX_TRADES_ORIGIN] });
      void renderState();
    })();
  });
  $('#turn-on').addEventListener('click', () => void requestAndTurnOn());

  const desktop = $<HTMLInputElement>('#desktop');
  void chrome.permissions.contains({ permissions: ['notifications'] }).then((granted) => {
    desktop.checked = alerts.desktop && granted;
  });
  desktop.addEventListener('change', () => {
    void (async () => {
      if (desktop.checked && !(await request(withAlerts({ permissions: ['notifications'] })))) {
        desktop.checked = false;
        return;
      }
      await save({ desktop: desktop.checked });
      if (desktop.checked) await turnOn();
      if (!desktop.checked) await release({ permissions: ['notifications'] });
    })();
  });

  const rare = $<HTMLInputElement>('#rare-bypass');
  rare.checked = alerts.rareBypass;
  rare.addEventListener('change', () => void save({ rareBypass: rare.checked }));
}

function renderDiscord(): void {
  const webhook = $<HTMLInputElement>('#discord-webhook');
  const user = $<HTMLInputElement>('#discord-user');
  webhook.value = alerts.discordWebhook;
  user.value = alerts.discordUserId;
  if (alerts.discordWebhook) note('#discord-note', 'Connected. Alerts are posted to this webhook.', 'good');
  $('#discord-save').addEventListener('click', () => {
    void (async () => {
      const url = webhook.value.trim();
      const id = user.value.trim();
      const canonical = url ? normaliseWebhook(url) : '';
      webhook.setAttribute('aria-invalid', String(canonical === null));
      user.setAttribute('aria-invalid', String(Boolean(id) && !isDiscordUserId(id)));
      if (canonical === null) return note('#discord-note', 'This is not a Discord webhook address.', 'bad');
      if (id && !isDiscordUserId(id)) {
        return note('#discord-note', 'A Discord user ID is a number of 17 to 20 digits.', 'bad');
      }
      if (!canonical) {
        await save({ discordWebhook: '', discordUserId: '' });
        await release({ origins: [DISCORD_ORIGIN] });
        user.value = '';
        return note('#discord-note', 'Discord alerts are off.');
      }
      if (!(await request(withAlerts({ origins: [DISCORD_ORIGIN] })))) {
        return note('#discord-note', 'Chrome did not allow RoLens to reach Discord.', 'bad');
      }
      await save({ discordWebhook: canonical, discordUserId: id });
      await turnOn();
      webhook.value = canonical;
      note(
        '#discord-note',
        id ? 'Saved. Alerts will mention you, so Discord notifies you.' : 'Saved. Alerts are posted to this webhook.',
        'good',
      );
    })();
  });
}

function randomTopic(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `rolens-${[...bytes].map((byte) => (byte % 36).toString(36)).join('')}`;
}

function renderNtfy(): void {
  const topic = $<HTMLInputElement>('#ntfy-topic');
  topic.value = alerts.ntfyTopic;
  if (alerts.ntfyTopic) note('#ntfy-note', `Connected. Subscribe to "${alerts.ntfyTopic}" in the ntfy app.`, 'good');
  $('#ntfy-generate').addEventListener('click', () => {
    topic.value = randomTopic();
    topic.setAttribute('aria-invalid', 'false');
    note('#ntfy-note', 'Press Save, then subscribe to this topic in the ntfy app.');
  });
  $('#ntfy-save').addEventListener('click', () => {
    void (async () => {
      const value = topic.value.trim();
      topic.setAttribute('aria-invalid', String(Boolean(value) && !isNtfyTopic(value)));
      if (!value) {
        await save({ ntfyTopic: '' });
        await release({ origins: [NTFY_ORIGIN] });
        return note('#ntfy-note', 'Phone alerts through ntfy are off.');
      }
      if (!isNtfyTopic(value)) {
        return note('#ntfy-note', 'Use 6 to 64 letters, digits, dashes or underscores.', 'bad');
      }
      if (!(await request(withAlerts({ origins: [NTFY_ORIGIN] })))) {
        return note('#ntfy-note', 'Chrome did not allow RoLens to reach ntfy.sh.', 'bad');
      }
      await save({ ntfyTopic: value });
      await turnOn();
      note('#ntfy-note', `Saved. Subscribe to "${value}" in the ntfy app.`, 'good');
    })();
  });
}

function renderFilters(): void {
  const bind = (selector: string, key: 'minReceive' | 'minGain' | 'minGainPercent', fallback: number | null) => {
    const input = $<HTMLInputElement>(selector);
    const current = alerts[key];
    input.value = current === null || current === 0 ? '' : String(current);
    input.addEventListener('change', () => {
      const value = Number(input.value);
      const valid = input.value.trim() !== '' && Number.isFinite(value);
      if (!valid) input.value = '';
      void save({ [key]: valid ? value : fallback });
    });
  };
  bind('#min-receive', 'minReceive', 0);
  bind('#min-gain', 'minGain', null);
  bind('#min-percent', 'minGainPercent', null);
}

function renderTest(): void {
  const button = $<HTMLButtonElement>('#test');
  button.addEventListener('click', () => {
    button.disabled = true;
    void send({ type: 'rolens:testAlert' })
      .catch(() => undefined)
      .then((result) => {
        button.disabled = false;
        const text = !result
          ? 'RoLens could not send the test. Please reload the extension and try again.'
          : !result.sent
            ? 'Set up at least one destination first.'
            : result.failures.length
              ? `Sent, but ${result.failures.join(' and ')} did not accept it.`
              : 'Sent. Check each destination.';
        $('#test-note').textContent = text;
      });
  });
}

function describeResult(result: CheckResult): string {
  if (result.primed) return 'Trades already in your inbound list were noted. New trades from now on will alert.';
  if (!result.newTrades) return 'No new inbound trades since the last check.';
  const parts = [`${result.newTrades} new ${result.newTrades === 1 ? 'trade' : 'trades'}`];
  if (result.alerted) parts.push(`${result.alerted} alerted`);
  if (result.filtered) parts.push(`${result.filtered} below your filters`);
  return `${parts.join(', ')}.`;
}

function renderCheckNow(): void {
  const button = $<HTMLButtonElement>('#check-now');
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Checking…';
    void send({ type: 'rolens:checkAlerts' })
      .catch(() => undefined)
      .then(async (response) => {
        button.disabled = false;
        button.textContent = 'Check now';
        await renderState();
        if (!response) $('#check-detail').textContent = 'RoLens could not run the check. Please reload the extension.';
      });
  });
}

async function renderState(): Promise<void> {
  const row = $('#check-row');
  const title = $('#check-status');
  const detail = $('#check-detail');
  $('#turn-on').hidden = alerts.enabled;
  $('#check-now').hidden = !alerts.enabled;
  if (!alerts.enabled) {
    row.dataset.state = 'off';
    title.textContent = 'Alerts are off';
    detail.textContent = 'Turn them on to be notified of new inbound trades.';
    return;
  }
  const stored = await chrome.storage.local.get(ALERT_STATE_KEY);
  const state = stored[ALERT_STATE_KEY] as
    | { lastCheck?: number | null; lastAlert?: number | null; lastError?: string | null; lastResult?: CheckResult }
    | undefined;
  if (state?.lastError) {
    row.dataset.state = 'error';
    title.textContent = 'Needs attention';
    detail.textContent = state.lastError;
  } else if (state?.lastCheck) {
    row.dataset.state = 'ok';
    title.textContent = 'Watching your inbound trades';
    const summary = state.lastResult ? ` ${describeResult(state.lastResult)}` : '';
    detail.textContent = `Last checked ${formatAge(state.lastCheck)}${state.lastAlert ? ` · last alert ${formatAge(state.lastAlert)}` : ''}.${summary}`;
  } else {
    row.dataset.state = 'waiting';
    title.textContent = 'Waiting for the first check';
    detail.textContent =
      'Trades already in your inbound list will not alert; only new ones will. Press Check now to start.';
  }
}

async function main(): Promise<void> {
  const [local, sync] = await Promise.all([chrome.storage.local.get(ALERTS_KEY), chrome.storage.sync.get('settings')]);
  alerts = normaliseAlerts(local[ALERTS_KEY]);
  const theme = normaliseSettings(sync.settings).theme;
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';

  renderSwitches();
  renderDiscord();
  renderNtfy();
  renderFilters();
  renderTest();
  renderCheckNow();
  await renderState();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[ALERT_STATE_KEY]) void renderState();
  });
  window.setInterval(() => void renderState(), 30_000);
}

void main();
