/*
 * Totals for completed trades: how much value went out and came in, the net result, how
 * many trades gained or lost value, and the best and worst trade. Values are today's,
 * so the figures say how the trades look now, not what they were worth at the time.
 */

export interface HistoryEntry {
  id: number;
  partner: string;
  /** When the trade was sent, in ms since the epoch; null when Roblox gave none. */
  created: number | null;
  /** Null when the trade's items could not be read. */
  given: number | null;
  received: number | null;
}

export interface HistorySummary {
  /** Trades in range, and how many of them could be valued. */
  count: number;
  valued: number;
  given: number;
  received: number;
  net: number;
  wins: number;
  losses: number;
  best: HistoryEntry | null;
  worst: HistoryEntry | null;
}

export const netOf = (entry: HistoryEntry): number | null =>
  entry.given === null || entry.received === null ? null : entry.received - entry.given;

/** Keeps trades sent within `days` of `now` (all when days is null) whose partner matches `partner`. */
export function filterHistory<T extends HistoryEntry>(
  entries: T[],
  days: number | null,
  partner: string,
  now: number,
): T[] {
  const query = partner.trim().toLowerCase();
  const cutoff = days === null ? null : now - days * 86_400_000;
  return entries.filter(
    (entry) =>
      (cutoff === null || (entry.created !== null && entry.created >= cutoff)) &&
      (!query || entry.partner.toLowerCase().includes(query)),
  );
}

export function summariseHistory(entries: HistoryEntry[]): HistorySummary {
  const summary: HistorySummary = {
    count: entries.length,
    valued: 0,
    given: 0,
    received: 0,
    net: 0,
    wins: 0,
    losses: 0,
    best: null,
    worst: null,
  };
  let bestNet = -Infinity;
  let worstNet = Infinity;
  for (const entry of entries) {
    const net = netOf(entry);
    if (net === null) continue;
    summary.valued += 1;
    summary.given += entry.given!;
    summary.received += entry.received!;
    if (net > 0) summary.wins += 1;
    if (net < 0) summary.losses += 1;
    if (net > bestNet) [bestNet, summary.best] = [net, entry];
    if (net < worstNet) [worstNet, summary.worst] = [net, entry];
  }
  summary.net = summary.received - summary.given;
  // A single trade is not both the best and the worst.
  if (summary.valued < 2) summary.worst = null;
  if (summary.best && netOf(summary.best)! <= 0) summary.best = null;
  if (summary.worst && netOf(summary.worst)! >= 0) summary.worst = null;
  return summary;
}
