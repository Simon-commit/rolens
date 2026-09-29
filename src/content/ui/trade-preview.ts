import { formatDelta, formatPercent, formatRobux, percentChange } from '../../core/format';
import type { TradeBalance } from '../../core/trade';
import { el } from '../dom';
import type { RenderContext } from './context';
import { createWidget } from './shadow';
import { attachTip } from './tooltip';

/*
 * A compact verdict on a trade in the Trades list, so each trade can be judged before it
 * is opened. It floats over the row's bottom-right corner and never changes its size.
 */

export type TradePreviewState = { kind: 'loading' } | { kind: 'ready'; balance: TradeBalance; unlisted: number };

const css = `
:host { position: absolute; right: 10px; bottom: 8px; z-index: 2; pointer-events: auto; line-height: 1; }
.pill {
  display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px;
  border-radius: 999px; white-space: nowrap; outline: none;
  font-size: 11px; font-weight: 700; letter-spacing: -0.01em; font-variant-numeric: tabular-nums;
  color: var(--rl-text-2); background: var(--rl-surface);
  box-shadow: inset 0 0 0 1px var(--rl-border);
  animation: rl-pop 0.24s cubic-bezier(0.2, 0, 0, 1) both;
}
@keyframes rl-pop { from { opacity: 0; transform: translateY(2px) scale(0.96); } }
.pill[data-verdict='win'] { color: var(--rl-win); background: color-mix(in srgb, var(--rl-win) 12%, var(--rl-bg-raised)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rl-win) 28%, transparent); }
.pill[data-verdict='loss'] { color: var(--rl-loss); background: color-mix(in srgb, var(--rl-loss) 12%, var(--rl-bg-raised)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rl-loss) 28%, transparent); }
.dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.pct { font-weight: 600; opacity: 0.8; }
.unvalued {
  margin-left: 2px; padding-left: 6px; border-left: 1px solid currentColor;
  font-weight: 600; color: var(--rl-warn); border-left-color: color-mix(in srgb, currentColor 40%, transparent);
}
.pill.is-loading { width: 64px; background: linear-gradient(90deg, var(--rl-surface) 0%, var(--rl-surface-2) 50%, var(--rl-surface) 100%) 0 0 / 200% 100%; animation: rl-sheen 1.2s linear infinite; }
@keyframes rl-sheen { to { background-position: -200% 0; } }
`;

function verdictOf(delta: number): 'win' | 'loss' | 'even' {
  return delta > 0 ? 'win' : delta < 0 ? 'loss' : 'even';
}

function stateKey(state: TradePreviewState, compact: boolean): string {
  if (state.kind === 'loading') return 'loading';
  const { balance } = state;
  return JSON.stringify([balance.give.value, balance.receive.value, balance.rapDelta, state.unlisted, compact]);
}

/** Creates or updates a row's preview in place. */
export function renderTradePreview(
  existing: HTMLElement | null,
  state: TradePreviewState,
  ctx: RenderContext,
): HTMLElement {
  const compact = ctx.settings.compactNumbers;
  const key = stateKey(state, compact);
  if (existing?.dataset.state === key) return existing;
  const host = existing ?? createWidget('trade-preview', css).host;
  host.dataset.state = key;
  const root = host.shadowRoot!;
  root.querySelector('.pill')?.remove();

  if (state.kind === 'loading') {
    const pill = el('span', 'pill is-loading');
    pill.setAttribute('aria-label', 'Loading trade value');
    root.append(pill);
    return host;
  }

  const { balance, unlisted } = state;
  const verdict = verdictOf(balance.valueDelta);
  const pct = percentChange(balance.valueDelta, balance.give.value);
  const pill = el(
    'span',
    'pill',
    el('span', 'dot'),
    verdict === 'even' ? 'Even' : formatDelta(balance.valueDelta, true),
    // With items missing, the percentage is not meaningful, and the pill stays as compact as the others.
    pct === null || verdict === 'even' || unlisted ? null : el('span', 'pct', formatPercent(pct)),
    // A total missing items must not look complete.
    unlisted ? el('span', 'unvalued', `${unlisted} unvalued`) : null,
  );
  pill.dataset.verdict = verdict;
  const verdictWord = verdict === 'win' ? 'Win' : verdict === 'loss' ? 'Loss' : 'Even';
  const detail = [
    `You offer ${formatRobux(balance.give.value, compact)} and receive ${formatRobux(balance.receive.value, compact)} in value.`,
    `RAP difference: ${formatDelta(balance.rapDelta, compact)}.`,
    unlisted
      ? `${unlisted === 1 ? 'One item has' : `${unlisted} items have`} no value and ${unlisted === 1 ? 'is' : 'are'} not counted.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const title = `${verdictWord}${pct === null ? '' : ` ${formatPercent(pct)}`}${unlisted ? ' (incomplete)' : ''}`;
  attachTip(pill, title, detail);
  root.append(pill);
  return host;
}
