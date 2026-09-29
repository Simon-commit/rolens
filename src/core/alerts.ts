import { formatDelta, formatPercent, formatRobux, percentChange } from './format';

/*
 * Inbound trade alerts: the user's alert settings, the filters that decide whether a new
 * inbound trade is worth an alert, and the exact messages sent to each destination. Kept
 * free of browser APIs so every rule and payload is unit tested. What is sent is only what
 * the alert shows: the trader's name, the items with their values, and the totals.
 */

export const ALERTS_KEY = 'alerts';
export const ALERT_STATE_KEY = 'alertState';
export const ALERT_ALARM = 'rolens-inbound';
/** Minutes between checks of the inbound trades list. Roblox rate-limits the trades API. */
export const ALERT_PERIOD_MINUTES = 1;
/** New trades read in full per check; the rest wait for the next check. */
export const ALERT_MAX_PER_CHECK = 5;
export const TRADES_URL = 'https://www.roblox.com/trades';

export const ROBLOX_TRADES_ORIGIN = 'https://trades.roblox.com/*';
export const DISCORD_ORIGIN = 'https://discord.com/*';
export const NTFY_ORIGIN = 'https://ntfy.sh/*';

export interface AlertSettings {
  enabled: boolean;
  /** A notification from Chrome on this computer. */
  desktop: boolean;
  /** A Discord webhook URL; empty when not used. The Discord app delivers it to the phone. */
  discordWebhook: string;
  /** A Discord user id to mention, so Discord notifies that user; empty for no mention. */
  discordUserId: string;
  /** An ntfy topic for phone notifications through the free, open source ntfy app; empty when not used. */
  ntfyTopic: string;
  /** Minimum total value the user would receive. 0 means any. */
  minReceive: number;
  /** Minimum net value gain; null means any, including losses. */
  minGain: number | null;
  /** Minimum gain in percent; null means any. */
  minGainPercent: number | null;
  /** Trades with a rare item on either side always alert, whatever the filters say. */
  rareBypass: boolean;
}

export const DEFAULT_ALERTS: AlertSettings = {
  enabled: false,
  desktop: false,
  discordWebhook: '',
  discordUserId: '',
  ntfyTopic: '',
  minReceive: 0,
  minGain: null,
  minGainPercent: null,
  rareBypass: true,
};

const WEBHOOK =
  /^https:\/\/(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com\/api\/webhooks\/(\d{5,25})\/([\w-]{20,120})\/?$/;
const DISCORD_ID = /^\d{15,25}$/;
const NTFY_TOPIC = /^[A-Za-z0-9_-]{6,64}$/;

/** The webhook in its canonical form (discord.com), or null when it is not a Discord webhook URL. */
export function normaliseWebhook(url: string): string | null {
  const match = WEBHOOK.exec(url.trim());
  return match ? `https://discord.com/api/webhooks/${match[1]}/${match[2]}` : null;
}

export const isDiscordUserId = (value: string) => DISCORD_ID.test(value.trim());
export const isNtfyTopic = (value: string) => NTFY_TOPIC.test(value.trim());

const number = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;

export function normaliseAlerts(stored: unknown): AlertSettings {
  const result: AlertSettings = { ...DEFAULT_ALERTS };
  if (typeof stored !== 'object' || stored === null) return result;
  const raw = stored as Record<string, unknown>;
  for (const key of ['enabled', 'desktop', 'rareBypass'] as const) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  if (typeof raw.discordWebhook === 'string') result.discordWebhook = normaliseWebhook(raw.discordWebhook) ?? '';
  if (typeof raw.discordUserId === 'string' && isDiscordUserId(raw.discordUserId)) {
    result.discordUserId = raw.discordUserId.trim();
  }
  if (typeof raw.ntfyTopic === 'string' && isNtfyTopic(raw.ntfyTopic)) result.ntfyTopic = raw.ntfyTopic.trim();
  result.minReceive = number(raw.minReceive, 0, 1e12) ?? 0;
  result.minGain = number(raw.minGain, -1e12, 1e12);
  result.minGainPercent = number(raw.minGainPercent, -100, 100_000);
  return result;
}

export interface AlertItem {
  name: string;
  /** Value (or RAP when unvalued); null when no source values the item. */
  value: number | null;
  rare: boolean;
}

export interface TradeAlert {
  tradeId: number;
  partner: { name: string; displayName: string };
  give: { items: AlertItem[]; robux: number; value: number };
  receive: { items: AlertItem[]; robux: number; value: number };
  /** receive.value - give.value, with Robux received counted after Roblox's fee. */
  net: number;
  rapDelta: number;
  /** Items no source values; they are not counted in the totals. */
  unvalued: number;
  sources: string;
  /** The partner's public avatar headshot on Roblox's CDN, shown in Discord alerts. */
  avatar?: string | null;
}

export const hasRare = (alert: TradeAlert) => [...alert.give.items, ...alert.receive.items].some((item) => item.rare);

/** Whether a new inbound trade passes the user's filters. Rare items bypass them when chosen. */
export function shouldAlert(alert: TradeAlert, settings: AlertSettings): boolean {
  if (settings.rareBypass && hasRare(alert)) return true;
  if (alert.receive.value < settings.minReceive) return false;
  if (settings.minGain !== null && alert.net < settings.minGain) return false;
  if (settings.minGainPercent !== null) {
    const pct = percentChange(alert.net, alert.give.value);
    if (pct === null || pct < settings.minGainPercent) return false;
  }
  return true;
}

const partnerLabel = (alert: TradeAlert) =>
  alert.partner.displayName && alert.partner.name && alert.partner.displayName !== alert.partner.name
    ? `${alert.partner.displayName} (@${alert.partner.name})`
    : alert.partner.displayName || alert.partner.name || 'A player';

function sideLines(side: TradeAlert['give']): string[] {
  const lines = side.items.map(
    (item) =>
      `${item.name || 'Unnamed item'}${item.rare ? ' (rare)' : ''}: ${item.value === null ? 'no value' : formatRobux(item.value, true)}`,
  );
  if (side.robux) lines.push(`Robux: ${formatRobux(side.robux, false)}`);
  return lines.length ? lines : ['Nothing'];
}

/** The one-line verdict, e.g. "+120K value (+8.4%)". */
export function alertHeadline(alert: TradeAlert): string {
  const pct = percentChange(alert.net, alert.give.value);
  return `${formatDelta(alert.net, true)} value${pct === null || alert.unvalued ? '' : ` (${formatPercent(pct)})`}`;
}

/** Title and body for a desktop or phone notification. */
export function alertText(alert: TradeAlert): { title: string; body: string } {
  return {
    title: `New trade from ${partnerLabel(alert)}${hasRare(alert) ? ' · Rare item' : ''}`,
    body: [
      `You give ${formatRobux(alert.give.value, true)}, you receive ${formatRobux(alert.receive.value, true)}. ${alertHeadline(alert)}.`,
      alert.unvalued ? `${alert.unvalued} unvalued ${alert.unvalued === 1 ? 'item is' : 'items are'} not counted.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

/** One side of a trade for Discord: an item per line with its value, then the total. */
function discordSide(side: TradeAlert['give']): string {
  const lines = side.items.map(
    (item) =>
      `${item.value === null ? '*No value*' : `**${formatRobux(item.value, true)}**`}  ${item.name || 'Unnamed item'}${item.rare ? ' · *Rare*' : ''}`,
  );
  if (side.robux) lines.push(`**${formatRobux(side.robux, true)}**  Robux`);
  if (!lines.length) lines.push('*Nothing*');
  const total = `Total **${formatRobux(side.value, true)}**`;
  // Discord allows 1,024 characters per field.
  const body = lines.join('\n');
  return `${body.length > 960 ? `${body.slice(0, 960)}…` : body}\n\n${total}`;
}

const CDN_IMAGE = /^https:\/\/[a-z0-9-]+\.rbxcdn\.com\/[\w./-]+$/;

/**
 * The Discord webhook message: an embed with the partner and their avatar, the verdict,
 * both sides with their totals, and a mention only when the user asked for one.
 */
export function discordPayload(alert: TradeAlert, settings: AlertSettings): Record<string, unknown> {
  const color = alert.net > 0 ? 0x10b981 : alert.net < 0 ? 0xe11d48 : 0x8b93a1;
  const pct = percentChange(alert.net, alert.give.value);
  const verdict = alert.net > 0 ? 'Gain' : alert.net < 0 ? 'Loss' : 'Even';
  const mention = settings.discordUserId ? `<@${settings.discordUserId}>` : '';
  const avatar = alert.avatar && CDN_IMAGE.test(alert.avatar) ? alert.avatar : null;
  return {
    username: 'RoLens',
    content: mention,
    allowed_mentions: { parse: [], users: settings.discordUserId ? [settings.discordUserId] : [] },
    embeds: [
      {
        author: { name: hasRare(alert) ? 'New inbound trade · Rare item' : 'New inbound trade' },
        title: partnerLabel(alert).slice(0, 250),
        url: TRADES_URL,
        color,
        ...(avatar ? { thumbnail: { url: avatar } } : {}),
        description: [
          `**${verdict} ${formatDelta(alert.net, true)}**${pct === null || alert.unvalued ? '' : ` (${formatPercent(pct)})`}`,
          `RAP ${formatDelta(alert.rapDelta, true)}`,
        ].join('\n'),
        fields: [
          { name: 'You give', value: discordSide(alert.give), inline: true },
          { name: 'You receive', value: discordSide(alert.receive), inline: true },
        ],
        footer: {
          text: `RoLens · Values from ${alert.sources}${alert.unvalued ? ` · ${alert.unvalued} unvalued not counted` : ''}`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/** The ntfy request: plain text, with the title, priority and a link to the Trades page in headers. */
export function ntfyRequest(alert: TradeAlert, topic: string): { url: string; init: RequestInit } {
  const { title, body } = alertText(alert);
  const details = [`You give:`, ...sideLines(alert.give), '', `You receive:`, ...sideLines(alert.receive)].join('\n');
  return {
    url: `https://ntfy.sh/${encodeURIComponent(topic)}`,
    init: {
      method: 'POST',
      credentials: 'omit',
      headers: {
        // Header values must be plain ASCII.
        Title: title.replace(' · ', ' - ').replace(/[^\x20-\x7e]/g, ''),
        Priority: hasRare(alert) ? '4' : '3',
        Tags: alert.net >= 0 ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend',
        Click: TRADES_URL,
      },
      body: `${body}\n\n${details}`,
    },
  };
}

/** A made-up trade for the "Send test alert" button, clearly labelled as a test. */
export function testAlert(sources: string): TradeAlert {
  return {
    tradeId: 0,
    partner: { name: 'rolens_test', displayName: 'RoLens test' },
    give: { items: [{ name: 'Test item A', value: 120_000, rare: false }], robux: 0, value: 120_000 },
    receive: {
      items: [
        { name: 'Test item B', value: 90_000, rare: false },
        { name: 'Test item C', value: 45_000, rare: false },
      ],
      robux: 0,
      value: 135_000,
    },
    net: 15_000,
    rapDelta: 9_000,
    unvalued: 0,
    sources,
  };
}
