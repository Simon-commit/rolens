import { plural } from '../core/format';
import type { TradeCache } from '../core/trade-cache';
import { fetchTradeList, fetchTradeOffers, type TradeOffers, type TradeSummaryRow } from './roblox-api';
import { SELECTORS } from './selectors';
import { activeTradeList, signedInUserId } from './trade-list';
import { loadTradeValues, valueTrade, type TradeValuer } from './trade-values';
import type { RenderContext } from './ui/context';
import { openHistoryDialog, type HistoryTrade } from './ui/history-dialog';
import { renderHistoryTools } from './ui/history-tools';

/*
 * Trade history. Reads the completed trades list and each trade's items with the user's
 * session, the same read-only requests the Trades list previews use, at Roblox's pace.
 * Trades read before come from this device, so opening it again is quick. Nothing leaves
 * the browser.
 */

/** Completed pages to read at most (25 trades each). */
const MAX_PAGES = 20;

export interface HistoryDeps extends TradeValuer {
  fetchList?: typeof fetchTradeList;
  fetchOffers?: typeof fetchTradeOffers;
  tradeCache?: TradeCache;
  now?: () => number;
}

const partnerName = (row: TradeSummaryRow) => row.partner.displayName || row.partner.name || 'Unknown player';

export async function openHistory(ctx: RenderContext, deps: HistoryDeps, opener: HTMLElement | null): Promise<void> {
  const dialog = openHistoryDialog(opener, ctx.settings.compactNumbers);
  const me = signedInUserId();
  if (me === null) {
    dialog.message('Please sign in to Roblox to see your trade history.');
    return;
  }
  const rows: TradeSummaryRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await (deps.fetchList ?? fetchTradeList)('completed', cursor);
    if (!result) {
      if (page === 0) {
        dialog.message('Roblox did not return your completed trades. Please try again in a minute.');
        return;
      }
      break;
    }
    rows.push(...result.rows);
    dialog.progress(`Found ${plural(rows.length, 'completed trade')}…`);
    cursor = result.next;
    if (!cursor) break;
  }
  if (!rows.length) {
    dialog.message('You have no completed trades yet.');
    return;
  }

  const saved = deps.tradeCache ? await deps.tradeCache.all(me) : new Map<number, TradeOffers>();
  const offers = new Map<number, TradeOffers>();
  const unread = rows.filter((row) => {
    const known = saved.get(row.id);
    if (known) offers.set(row.id, known);
    return !known;
  });
  let stopped = false;
  for (const [index, row] of unread.entries()) {
    if (stopped) break;
    dialog.progress(`Reading trade ${index + 1} of ${unread.length}…`, index / unread.length, () => (stopped = true));
    const read = await (deps.fetchOffers ?? fetchTradeOffers)(row.id, me);
    if (read) {
      offers.set(row.id, read);
      void deps.tradeCache?.save(me, row.id, read);
    }
  }

  await loadTradeValues([...offers.values()], deps);
  const trades: HistoryTrade[] = rows.map((row) => {
    const trade = offers.get(row.id);
    const valued = trade ? valueTrade(trade, deps) : null;
    return {
      id: row.id,
      partner: partnerName(row),
      created: row.created,
      valued,
      given: valued ? valued.balance.give.value : null,
      received: valued ? valued.balance.receive.value : null,
    };
  });
  const missing = rows.length - offers.size;
  const note = `At current values, with Robux received after Roblox's fee.${missing ? ` ${plural(missing, 'trade')} not read yet.` : ''}`;
  dialog.show(trades, (deps.now ?? Date.now)(), note);
}

/** Shows the history button above the Trades list while it shows completed trades. */
export function renderHistoryButton(ctx: RenderContext, deps: HistoryDeps): void {
  const existing = document.querySelector<HTMLElement>('[data-rolens="history-tools"]');
  const list = document.querySelector(SELECTORS.tradeRow)?.parentElement;
  if (!list || activeTradeList() !== 'completed' || signedInUserId() === null) {
    existing?.remove();
    return;
  }
  const host = renderHistoryTools(existing, (opener) => void openHistory(ctx, deps, opener));
  if (list.previousElementSibling !== host) list.before(host);
}
