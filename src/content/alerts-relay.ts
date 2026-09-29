import { isRelayRequest, type RelayResponse } from '../background/roblox-relay';
import { fetchTradeList, fetchTradeOffersWith, lastTradeFailure, userHeadshots } from './roblox-api';

/*
 * Lets inbound alerts read the inbound trades list through this Roblox tab. The requests
 * are the same read-only ones the Trades page previews make, sent from roblox.com with the
 * session it already has, plus the partner's public avatar headshot (read without cookies)
 * for Discord alerts. Only RoLens's own service worker can ask.
 */

export function serveAlertReads(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || sender.tab || !isRelayRequest(message)) return false;
    const read: Promise<unknown> =
      message.op === 'list'
        ? fetchTradeList('inbound', null)
        : message.op === 'headshot'
          ? userHeadshots([message.userId]).then((images) => images.get(message.userId) ?? null)
          : fetchTradeOffersWith(message.tradeId, message.partnerId);
    void read.then(
      (data) => sendResponse({ data, failure: data ? null : lastTradeFailure() } satisfies RelayResponse<unknown>),
      () => sendResponse({ data: null, failure: lastTradeFailure() } satisfies RelayResponse<unknown>),
    );
    return true;
  });
  // Tells the service worker this tab can read trades for alerts.
  void chrome.runtime.sendMessage({ type: 'rolens:hello' }).catch(() => undefined);
}
