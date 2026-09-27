import type { Confidence, Trend } from '../../core/types';
import { el } from '../dom';
import { icon, type IconName } from './icons';

export function pill(text: string, variant?: 'warn' | 'win' | 'loss' | 'rare', iconName?: IconName): HTMLElement {
  return el('span', variant ? `rl-pill rl-pill--${variant}` : 'rl-pill', iconName ? icon(iconName) : null, text);
}

/** Five bars, `level` of them lit. Level 0 means unrated. */
export function demandMeter(level: number): HTMLElement {
  const meter = el('span', 'rl-meter');
  meter.dataset.level = String(level);
  meter.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= 5; i++) meter.append(el('span', i <= level ? 'is-on' : ''));
  return meter;
}

const CONFIDENCE_DOTS: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

export function confidenceDots(confidence: Confidence): HTMLElement {
  const dots = el('span', 'rl-confidence');
  dots.title = `${confidence} confidence`;
  for (let i = 1; i <= 3; i++) dots.append(el('i', i <= CONFIDENCE_DOTS[confidence] ? 'is-on' : ''));
  return dots;
}

export const TREND_ICON: Record<Trend, IconName> = {
  raising: 'up',
  lowering: 'down',
  stable: 'flat',
  unstable: 'wave',
  fluctuating: 'wave',
};

export const TREND_TONE: Record<Trend, 'win' | 'loss' | 'warn' | 'neutral'> = {
  raising: 'win',
  lowering: 'loss',
  stable: 'neutral',
  unstable: 'warn',
  fluctuating: 'warn',
};
