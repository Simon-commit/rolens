import { isRelayRequest, type RelayResponse } from '../background/roblox-relay';
import { fetchTradeList, fetchTradeOffersWith, lastTradeFailure } from './roblox-api';

/*
 * Lets inbound alerts read the inbound trades list through this Roblox tab. The requests
 * are the same read-only ones the Trades page previews make, sent from roblox.com with the
 * session it already has. Only RoLens's own service worker can ask.
 */

export function serveAlertReads(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || sender.tab || !isRelayRequest(message)) return false;
    const read =
      message.op === 'list'
        ? fetchTradeList('inbound', null)
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
