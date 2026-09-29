import { formatPercent, plural } from '../../core/format';
import { DISAGREEMENT_THRESHOLD } from '../../core/routility';
import type { Trend } from '../../core/types';
import { formatUsd } from '../../core/usd';

/*
 * Explanations shown on hover, written once so every widget describes a marker in the
 * same words. Each is a [title, body] pair; bodies are complete sentences.
 */
export type Tip = [title: string, body: string];

const isAre = (n: number) => (n === 1 ? 'is' : 'are');

export const TIPS = {
  rare: ['Rare', 'This item is classified as rare: very few copies are in circulation.'],
  projected: [
    'Projected RAP',
    "Recent above-market sales have inflated this item's RAP. Its value is a more reliable measure than its RAP.",
  ],
  hyped: ['Hyped', 'This item is in unusually high demand. Its current price may not be sustained.'],
} satisfies Record<string, Tip>;

export function disagreeTip(difference: number): Tip {
  return [
    'Sources disagree',
    `Rolimon's and RoUtility differ by ${formatPercent(difference * 100)} on this item. Both sources should be reviewed before trading it.`,
  ];
}

export function rareTradeTip(count: number): Tip {
  return [
    'Rare items',
    `${plural(count, 'item')} in this trade ${isAre(count)} classified as rare: very few copies are in circulation.`,
  ];
}

export const PROJECTED_TRADE_TIP: Tip = [
  'Projected RAP',
  'This trade includes an item whose RAP has been inflated by recent above-market sales. Its value is a more reliable measure than its RAP.',
];

export function disagreeTradeTip(count: number): Tip {
  return [
    'Sources disagree',
    `Rolimon's and RoUtility differ by ${Math.round(DISAGREEMENT_THRESHOLD * 100)}% or more on ${plural(count, 'item')}. Both sources should be reviewed before this trade is accepted.`,
  ];
}

export function unlistedTradeTip(count: number): Tip {
  return [
    'Unlisted items',
    `${plural(count, 'item')} ${isAre(count)} not listed by the enabled sources and ${isAre(count)} excluded from the totals.`,
  ];
}

/** What each price trend means. */
export const TREND_TIPS: Record<Trend, string> = {
  raising: 'Recent sale prices are trending upward.',
  lowering: 'Recent sale prices are trending downward.',
  stable: 'Recent sale prices have remained consistent.',
  unstable: 'Recent sale prices vary significantly, so the value carries more uncertainty.',
  fluctuating:
    'Sale prices alternate between higher and lower levels, so some variation around the value should be expected.',
};

/** For a USD figure calculated at the fallback rate rather than published by RoUtility. */
export function rateTip(rate: number): Tip {
  return [
    'Estimated USD value',
    `RoUtility does not publish a USD estimate for this item. This figure is calculated at the fallback rate of ${formatUsd(rate, false)} per 1,000 value. A rate of $3 per 1,000 value is widely recognised as the prevailing market reference for limited items. It should be regarded as indicative only.`,
  ];
}
