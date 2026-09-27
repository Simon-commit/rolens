import { describe, expect, it } from 'vitest';
import { buildAlert } from '../src/background/inbound-alerts';
import {
  DEFAULT_ALERTS,
  discordPayload,
  normaliseAlerts,
  normaliseWebhook,
  ntfyRequest,
  shouldAlert,
  testAlert,
  type TradeAlert,
} from '../src/core/alerts';
import { item } from './fixtures/items';

const alert = (patch: Partial<TradeAlert> = {}): TradeAlert => ({ ...testAlert("Rolimon's"), ...patch });

describe('alert settings', () => {
  it('keeps only valid destinations', () => {
    const settings = normaliseAlerts({
      enabled: true,
      discordWebhook: 'https://discordapp.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-ABC',
      discordUserId: '123',
      ntfyTopic: 'no spaces allowed',
      minReceive: -5,
      minGain: 1000,
    });
    expect(settings.discordWebhook).toBe(
      'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-ABC',
    );
    expect(settings.discordUserId).toBe('');
    expect(settings.ntfyTopic).toBe('');
    expect(settings.minReceive).toBe(0);
    expect(settings.minGain).toBe(1000);
    expect(normaliseWebhook('https://example.com/api/webhooks/1/2')).toBeNull();
  });
});

describe('filters', () => {
  it('applies the minimums', () => {
    const base = alert(); // give 120K, receive 135K, net +15K (12.5%)
    expect(shouldAlert(base, DEFAULT_ALERTS)).toBe(true);
    expect(shouldAlert(base, { ...DEFAULT_ALERTS, minReceive: 200_000 })).toBe(false);
    expect(shouldAlert(base, { ...DEFAULT_ALERTS, minGain: 20_000 })).toBe(false);
    expect(shouldAlert(base, { ...DEFAULT_ALERTS, minGainPercent: 10 })).toBe(true);
    expect(shouldAlert(base, { ...DEFAULT_ALERTS, minGainPercent: 15 })).toBe(false);
  });

  it('lets rare items through every filter when chosen', () => {
    const rare = alert({
      give: { items: [{ name: 'Rare thing', value: 5_000_000, rare: true }], robux: 0, value: 5_000_000 },
      net: -4_865_000,
    });
    const strict = { ...DEFAULT_ALERTS, minGain: 1 };
    expect(shouldAlert(rare, strict)).toBe(true);
    expect(shouldAlert(rare, { ...strict, rareBypass: false })).toBe(false);
  });
});

describe('alert messages', () => {
  it('mentions the user on Discord only when asked, and only that user', () => {
    const payload = discordPayload(alert(), { ...DEFAULT_ALERTS, discordUserId: '123456789012345678' });
    expect(payload.content).toBe('<@123456789012345678>');
    expect(payload.allowed_mentions).toEqual({ parse: [], users: ['123456789012345678'] });
    const quiet = discordPayload(alert(), DEFAULT_ALERTS);
    expect(quiet.content).toBe('');
    expect(quiet.allowed_mentions).toEqual({ parse: [], users: [] });
    const embed = (quiet.embeds as { title: string; fields: { name: string; value: string }[] }[])[0]!;
    expect(embed.title).toBe('New trade from RoLens test (@rolens_test)');
    expect(embed.fields[0]!.value).toBe('Test item A: 120K');
  });

  it('sends ntfy a plain-text message without cookies', () => {
    const { url, init } = ntfyRequest(alert(), 'rolens-abc123');
    expect(url).toBe('https://ntfy.sh/rolens-abc123');
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>).Click).toBe('https://www.roblox.com/trades');
    expect(String(init.body)).toContain('You receive:\nTest item B: 90K');
  });
});

describe('buildAlert', () => {
  it('values both sides, counting Robux received after the fee', () => {
    const values = new Map([
      [1, item({ id: 1, name: 'Hat', value: 1000, rap: 900 })],
      [2, item({ id: 2, name: 'Face', value: 800, rap: 700, rare: true })],
    ]);
    const result = buildAlert(
      9,
      { name: 'kyrie', displayName: 'Kyrie' },
      {
        give: { itemIds: [1], names: ['Hat'], robux: 0 },
        receive: { itemIds: [2, 3], names: ['Face', 'Mystery'], robux: 100 },
      },
      values,
      "Rolimon's",
    );
    expect(result.receive.value).toBe(870);
    expect(result.net).toBe(-130);
    expect(result.unvalued).toBe(1);
    expect(result.receive.items.map((entry) => entry.rare)).toEqual([true, false]);
  });
});
