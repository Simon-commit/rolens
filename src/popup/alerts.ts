import { applyAlertChange, readAlertSettings, requestAlertChange } from '../background/alert-grants';
import type { CheckResult } from '../background/inbound-alerts';
import {
  ALERT_STATE_KEY,
  ALERTS_KEY,
  DISCORD_ORIGIN,
  isDiscordUserId,
  isNtfyTopic,
  normaliseWebhook,
  NTFY_ORIGIN,
  ROBLOX_TRADES_ORIGIN,
  type AlertSettings,
} from '../core/alerts';
import { formatAge, formatRobux } from '../core/format';
import { send } from '../core/messages';

/*
 * The Alerts tab. Every permission is requested at the moment the user turns on the part
 * that needs it, and returned when it is turned off. Saving a destination also turns alerts
 * on, in the same Chrome prompt.
 */

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

let alerts: AlertSettings;

/**
 * A destination's permissions plus what alerts themselves need, so one Chrome prompt covers
 * both. Chrome does not prompt again for permissions already granted.
 */
function withAlerts(needed: chrome.permissions.Permissions = {}): chrome.permissions.Permissions {
  return {
    permissions: [...(needed.permissions ?? []), 'alarms'],
    origins: [...(needed.origins ?? []), ROBLOX_TRADES_ORIGIN],
  };
}

const release = (permissions: chrome.permissions.Permissions) =>
  chrome.permissions.remove(permissions).catch(() => false);

async function save(patch: Partial<AlertSettings>): Promise<void> {
  alerts = await applyAlertChange(patch);
}

function note(selector: string, text: string, tone?: 'good' | 'bad'): void {
  const node = $(selector);
  node.textContent = text;
  node.classList.remove('is-good', 'is-bad');
  if (tone) node.classList.add(`is-${tone}`);
}

function paintBadge(selector: string, connected: boolean): void {
  const badge = $(selector);
  badge.textContent = connected ? 'Connected' : 'Not set up';
  badge.className = `badge${connected ? '' : ' is-idle'}`;
}

function renderSwitches(): void {
  const enabled = $<HTMLInputElement>('#enabled');
  enabled.addEventListener('change', () => {
    void (async () => {
      if (enabled.checked) {
        if (!(await requestAlertChange({ enabled: true }, withAlerts()))) {
          enabled.checked = false;
        }
        return;
      }
      await save({ enabled: false });
      await release({ origins: [ROBLOX_TRADES_ORIGIN] });
    })();
  });

  const desktop = $<HTMLInputElement>('#desktop');
  desktop.addEventListener('change', () => {
    void (async () => {
      if (!desktop.checked) {
        await save({ desktop: false });
        await release({ permissions: ['notifications'] });
        return;
      }
      const patch = { desktop: true, enabled: true };
      if (!(await requestAlertChange(patch, withAlerts({ permissions: ['notifications'] })))) desktop.checked = false;
    })();
  });

  const rare = $<HTMLInputElement>('#rare-bypass');
  rare.addEventListener('change', () => void save({ rareBypass: rare.checked }));
}

function renderDiscord(): void {
  const webhook = $<HTMLInputElement>('#discord-webhook');
  const user = $<HTMLInputElement>('#discord-user');
  webhook.value = alerts.discordWebhook;
  user.value = alerts.discordUserId;
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
      const patch = { discordWebhook: canonical, discordUserId: id, enabled: true };
      if (!(await requestAlertChange(patch, withAlerts({ origins: [DISCORD_ORIGIN] })))) {
        return note('#discord-note', 'Chrome did not allow RoLens to reach Discord.', 'bad');
      }
      webhook.value = canonical;
      note('#discord-note', id ? 'Saved. Alerts mention you, so Discord notifies you.' : 'Saved.', 'good');
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
        return note('#ntfy-note', 'Phone alerts are off.');
      }
      if (!isNtfyTopic(value)) {
        return note('#ntfy-note', 'Use 6 to 64 letters, digits, dashes or underscores.', 'bad');
      }
      if (!(await requestAlertChange({ ntfyTopic: value, enabled: true }, withAlerts({ origins: [NTFY_ORIGIN] })))) {
        return note('#ntfy-note', 'Chrome did not allow RoLens to reach ntfy.sh.', 'bad');
      }
      note('#ntfy-note', `Saved. Subscribe to "${value}" in the ntfy app.`, 'good');
    })();
  });
}

function filtersSummary(): string {
  const parts: string[] = [];
  if (alerts.minReceive) parts.push(`receive ${formatRobux(alerts.minReceive, true)}+`);
  if (alerts.minGain !== null) parts.push(`gain ${formatRobux(alerts.minGain, true)}+`);
  if (alerts.minGainPercent !== null) parts.push(`gain ${alerts.minGainPercent}%+`);
  return parts.length ? `Only trades that ${parts.join(', ')}` : 'Every new trade alerts';
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
        const failed = !result || !result.sent || result.failures.length > 0;
        note(
          '#test-note',
          !result
            ? 'The test could not be sent. Please reload the extension.'
            : !result.sent
              ? 'Set up a destination first, then send a test.'
              : result.failures.length
                ? `The test was not accepted by ${result.failures.join(' and ')}.`
                : alerts.desktop
                  ? 'Test sent. If no Chrome notification appeared, allow notifications for Google Chrome in your system settings.'
                  : 'Test sent. Check each destination.',
          failed ? 'bad' : 'good',
        );
      });
  });
}

function describeResult(result: CheckResult): string {
  if (result.primed) return 'Waiting trades noted; new ones will alert.';
  if (!result.newTrades) return 'No new trades.';
  const parts = [`${result.newTrades} new`];
  if (result.alerted) parts.push(`${result.alerted} alerted`);
  if (result.filtered) parts.push(`${result.filtered} filtered`);
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
        if (!response) $('#check-detail').textContent = 'The check could not run. Please reload the extension.';
      });
  });
}

interface StoredState {
  lastCheck?: number | null;
  lastAlert?: number | null;
  lastError?: string | null;
  lastResult?: CheckResult;
}

/** Paints everything that follows from the stored settings and the last check. */
async function renderState(): Promise<void> {
  const stored = await chrome.storage.local.get(ALERT_STATE_KEY);
  const state = stored[ALERT_STATE_KEY] as StoredState | undefined;
  const has = (permissions: chrome.permissions.Permissions) =>
    chrome.permissions.contains(permissions).catch(() => false);
  const hasPermissions = await has({ origins: [ROBLOX_TRADES_ORIGIN] });
  const notifications = await has({ permissions: ['notifications'] });
  const on = alerts.enabled && hasPermissions;

  $<HTMLInputElement>('#enabled').checked = on;
  $<HTMLInputElement>('#desktop').checked = alerts.desktop && notifications;
  $<HTMLInputElement>('#rare-bypass').checked = alerts.rareBypass;
  paintBadge('#discord-badge', Boolean(alerts.discordWebhook));
  paintBadge('#ntfy-badge', Boolean(alerts.ntfyTopic));
  $('#filters-note').textContent = filtersSummary();

  const destinations = [alerts.discordWebhook, alerts.ntfyTopic, alerts.desktop && notifications].filter(
    Boolean,
  ).length;
  const failing = on && Boolean(state?.lastError);
  $('#alert-switch').dataset.state = on ? (failing ? 'error' : 'on') : 'off';
  // Flags a setup that is half done or failing; untouched alerts stay quiet.
  $('#alerts-dot').hidden = !(failing || (on && !destinations) || (!on && destinations));
  $('#alerts-dot').dataset.tone = failing ? 'bad' : 'idle';
  $('#alerts-note').textContent = !on
    ? destinations
      ? 'Off. Turn on to start receiving alerts.'
      : 'Off. Choose where to send alerts below.'
    : destinations
      ? 'On. Checks your inbound trades every minute.'
      : 'On. Choose where to send alerts below.';

  const row = $('#check-row');
  row.hidden = !on;
  if (!on) return;
  const title = $('#check-status');
  const detail = $('#check-detail');
  if (state?.lastError) {
    row.dataset.state = 'error';
    title.textContent = 'Needs attention';
    detail.textContent = state.lastError;
  } else if (state?.lastCheck) {
    row.dataset.state = 'ok';
    title.textContent = `Checked ${formatAge(state.lastCheck)}`;
    detail.textContent = state.lastResult ? describeResult(state.lastResult) : '';
  } else {
    row.dataset.state = 'waiting';
    title.textContent = 'Waiting for the first check';
    detail.textContent = 'Trades already waiting will not alert.';
  }
}

export async function initAlerts(): Promise<void> {
  alerts = await readAlertSettings();
  renderSwitches();
  renderDiscord();
  renderNtfy();
  renderFilters();
  renderTest();
  renderCheckNow();
  await renderState();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(changes[ALERT_STATE_KEY] || changes[ALERTS_KEY])) return;
    void readAlertSettings().then((next) => {
      alerts = next;
      return renderState();
    });
  });
  window.setInterval(() => void renderState(), 30_000);
}
