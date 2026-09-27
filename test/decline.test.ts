import { describe, expect, it } from 'vitest';
import { declineTrade } from '../src/content/roblox-api';

describe('declineTrade', () => {
  it('posts to the decline endpoint and retries once with a fresh anti-forgery token', async () => {
    const calls: { url: string; method?: string; token?: string }[] = [];
    const fetchFn = ((url: string, init: RequestInit) => {
      const token = (init.headers as Record<string, string>)['X-CSRF-TOKEN'];
      calls.push({ url, method: init.method, token });
      if (calls.length === 1)
        return Promise.resolve(new Response('', { status: 403, headers: { 'x-csrf-token': 'fresh' } }));
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as typeof fetch;
    await expect(declineTrade(42, fetchFn)).resolves.toBe('declined');
    expect(calls.map((call) => call.url)).toEqual([
      'https://trades.roblox.com/v1/trades/42/decline',
      'https://trades.roblox.com/v1/trades/42/decline',
    ]);
    expect(calls.every((call) => call.method === 'POST')).toBe(true);
    expect(calls[1]!.token).toBe('fresh');
  });
});
