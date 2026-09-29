import { formatDelta, formatPercent, formatRobux, percentChange } from '../../core/format';
import type { TradeBalance } from '../../core/trade';
import { effectiveValue } from '../../core/types';
import { formatUsd, formatUsdDelta, type UsdTotal } from '../../core/usd';
import type { ValuedItem, ValuedSide } from '../trade-values';

/*
 * Draws a trade proof: both players, the items each gave with values, the totals and
 * the net result, on a canvas. Everything is drawn locally; images are only ever drawn
 * from bitmaps RoLens decoded itself, so the canvas can always be exported.
 */

export interface ProofPlayer {
  name: string;
  displayName: string;
  avatar: ImageBitmap | null;
}

export interface ProofData {
  me: ProofPlayer;
  partner: ProofPlayer;
  /** When the trade was made, if known. */
  date: number | null;
  /** What the signed-in user gave and received. */
  give: ValuedSide;
  receive: ValuedSide;
  balance: TradeBalance;
  usd: { give: UsdTotal | null; receive: UsdTotal | null };
  thumbnails: Map<number, ImageBitmap>;
  sources: string;
  /** When the values were read. */
  valuesAt: number;
  compact: boolean;
  theme: 'light' | 'dark';
  /** Blue and orange for gains and losses, for colour-blind users. */
  colorBlind?: boolean;
}

const PALETTE = {
  light: {
    page: '#f4f5f7',
    card: '#ffffff',
    tile: '#eceef1',
    border: 'rgba(15, 23, 42, 0.09)',
    text: '#0f1419',
    text2: '#4b5563',
    text3: '#8b93a1',
    win: '#059669',
    loss: '#e11d48',
    rare: '#b7791f',
    brandA: '#10b981',
    brandB: '#06b6d4',
  },
  dark: {
    page: '#0b0e13',
    card: '#12161d',
    tile: '#1a1f28',
    border: 'rgba(255, 255, 255, 0.07)',
    text: '#eef1f5',
    text2: '#a3acb9',
    text3: '#697386',
    win: '#34d399',
    loss: '#fb7185',
    rare: '#fcd34d',
    brandA: '#34d399',
    brandB: '#22d3ee',
  },
};

const COLOR_BLIND = {
  light: { win: '#1d4ed8', loss: '#c2410c' },
  dark: { win: '#60a5fa', loss: '#fb923c' },
};

export const PROOF_WIDTH = 1080;
const SCALE = 2;
const PAD = 40;
const GAP = 20;
const CARD_PAD = 24;
const ROW = 72;
const FONT = "'RoLens Inter', 'Segoe UI', system-ui, sans-serif";

type Palette = (typeof PALETTE)['light'];

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Writes `text` no wider than `max`, ending in an ellipsis when it is cut. */
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  style: { font: string; color: string; align?: CanvasTextAlign; max?: number },
): number {
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  const shown = style.max ? fitText(ctx, value, style.max) : value;
  ctx.fillText(shown, x, y);
  return ctx.measureText(shown).width;
}

/** The RoLens mark: the lens on the brand gradient. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colors: Palette): void {
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, colors.brandA);
  gradient.addColorStop(1, colors.brandB);
  roundRect(ctx, x, y, size, size, size * 0.27);
  ctx.fillStyle = gradient;
  ctx.fill();
  const unit = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(unit, unit);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(10.4, 10.4, 5.4, 0, Math.PI * 2);
  ctx.moveTo(14.6, 14.6);
  ctx.lineTo(18.4, 18.4);
  ctx.moveTo(8.2, 11.6);
  ctx.lineTo(10.4, 9.4);
  ctx.lineTo(12.6, 11.6);
  ctx.stroke();
  ctx.restore();
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap | null | undefined,
  x: number,
  y: number,
  size: number,
  radius: number,
  colors: Palette,
  fallback: string,
): void {
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.fillStyle = colors.tile;
  ctx.fill();
  ctx.clip();
  if (image) {
    ctx.drawImage(image, x, y, size, size);
  } else {
    text(ctx, fallback.slice(0, 1).toUpperCase() || '?', x + size / 2, y + size / 2 + size * 0.14, {
      font: font(700, size * 0.4),
      color: colors.text3,
      align: 'center',
    });
  }
  ctx.restore();
}

function sideHeight(side: ValuedSide): number {
  const rows = Math.max(1, side.items.length + (side.robux > 0 ? 1 : 0));
  return CARD_PAD + 52 + 18 + rows * ROW + 18 + 3 * 30 + CARD_PAD;
}

function itemRow(
  ctx: CanvasRenderingContext2D,
  entry: ValuedItem,
  x: number,
  y: number,
  width: number,
  data: ProofData,
  colors: Palette,
): void {
  const thumb = 56;
  drawImage(ctx, data.thumbnails.get(entry.id), x, y + 8, thumb, 12, colors, entry.name);
  const left = x + thumb + 14;
  const right = x + width;
  const item = entry.item;
  const valueText = item ? formatRobux(effectiveValue(item), data.compact) : 'No value';
  ctx.font = font(700, 17);
  const valueWidth = ctx.measureText(valueText).width;
  const nameMax = right - left - Math.max(valueWidth, 70) - 16;
  const nameWidth = text(ctx, entry.name || 'Unnamed item', left, y + 34, {
    font: font(600, 15),
    color: colors.text,
    max: nameMax,
  });
  if (item?.rare) {
    text(ctx, 'RARE', left + nameWidth + 8, y + 33, { font: font(700, 10), color: colors.rare });
  }
  const sub = item ? `RAP ${formatRobux(item.rap, data.compact)}` : 'Not tracked by the sources';
  text(ctx, sub, left, y + 55, { font: font(500, 12.5), color: colors.text3, max: nameMax });
  text(ctx, valueText, right, y + 34, {
    font: font(700, 17),
    color: item ? colors.text : colors.text3,
    align: 'right',
  });
}

function robuxRow(
  ctx: CanvasRenderingContext2D,
  robux: number,
  x: number,
  y: number,
  width: number,
  data: ProofData,
  colors: Palette,
): void {
  drawImage(ctx, null, x, y + 8, 56, 12, colors, ' ');
  text(ctx, 'R$', x + 28, y + 42, { font: font(700, 17), color: colors.text2, align: 'center' });
  text(ctx, 'Robux', x + 70, y + 34, { font: font(600, 15), color: colors.text });
  text(ctx, 'Before the marketplace fee', x + 70, y + 55, { font: font(500, 12.5), color: colors.text3 });
  text(ctx, formatRobux(robux, data.compact), x + width, y + 34, {
    font: font(700, 17),
    color: colors.text,
    align: 'right',
  });
}

function totalLine(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  colors: Palette,
  strong = false,
): void {
  text(ctx, label, x, y, { font: font(500, 13.5), color: colors.text2 });
  text(ctx, value, x + width, y, {
    font: font(strong ? 700 : 600, strong ? 18 : 14),
    color: colors.text,
    align: 'right',
  });
}

function sideCard(
  ctx: CanvasRenderingContext2D,
  player: ProofPlayer,
  side: ValuedSide,
  totals: { value: number; rap: number },
  usd: UsdTotal | null,
  x: number,
  y: number,
  width: number,
  height: number,
  data: ProofData,
  colors: Palette,
): void {
  roundRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = colors.card;
  ctx.fill();
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  const inner = width - CARD_PAD * 2;
  const left = x + CARD_PAD;
  let top = y + CARD_PAD;
  drawImage(ctx, player.avatar, left, top, 48, 24, colors, player.displayName || player.name);
  const title = `${player.displayName || player.name} gave`;
  text(ctx, title, left + 62, top + 21, { font: font(700, 17), color: colors.text, max: inner - 62 });
  if (player.name) {
    text(ctx, `@${player.name}`, left + 62, top + 42, { font: font(500, 13), color: colors.text3, max: inner - 62 });
  }
  top += 52 + 18;

  for (const entry of side.items) {
    itemRow(ctx, entry, left, top, inner, data, colors);
    top += ROW;
  }
  if (side.robux > 0) {
    robuxRow(ctx, side.robux, left, top, inner, data, colors);
    top += ROW;
  }
  if (side.items.length === 0 && side.robux === 0) {
    text(ctx, 'Nothing', left, top + 40, { font: font(500, 14), color: colors.text3 });
    top += ROW;
  }

  top += 8;
  ctx.fillStyle = colors.border;
  ctx.fillRect(left, top, inner, 1);
  top += 10;
  totalLine(ctx, 'Total value', formatRobux(totals.value, data.compact), left, top + 20, inner, colors, true);
  totalLine(ctx, 'RAP', formatRobux(totals.rap, data.compact), left, top + 50, inner, colors);
  totalLine(
    ctx,
    'USD',
    usd ? `${usd.estimated ? '≈' : ''}${formatUsd(usd.value, data.compact)}` : 'Not available',
    left,
    top + 80,
    inner,
    colors,
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Draws the proof and returns the canvas, at twice its layout size for sharp text. */
export function drawProof(data: ProofData, doc: Document = document): HTMLCanvasElement {
  const colors = data.colorBlind ? { ...PALETTE[data.theme], ...COLOR_BLIND[data.theme] } : PALETTE[data.theme];
  const cardWidth = (PROOF_WIDTH - PAD * 2 - GAP) / 2;
  const cardHeight = Math.max(sideHeight(data.give), sideHeight(data.receive));
  const top = PAD + 44 + 28;
  const netTop = top + cardHeight + GAP;
  const footerY = netTop + 76 + 38;
  const height = footerY + PAD - 10;

  const canvas = doc.createElement('canvas');
  canvas.width = PROOF_WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = colors.page;
  ctx.fillRect(0, 0, PROOF_WIDTH, height);

  // Header: mark, title, date.
  drawMark(ctx, PAD, PAD, 36, colors);
  const brandWidth = text(ctx, 'RoLens', PAD + 48, PAD + 25, { font: font(700, 20), color: colors.text });
  text(ctx, 'Trade proof', PAD + 48 + brandWidth + 10, PAD + 25, { font: font(500, 20), color: colors.text3 });
  text(
    ctx,
    data.date === null ? 'Completed trade' : `Completed ${dateFormat.format(data.date)}`,
    PROOF_WIDTH - PAD,
    PAD + 25,
    { font: font(600, 15), color: colors.text2, align: 'right' },
  );

  const { balance } = data;
  sideCard(ctx, data.me, data.give, balance.give, data.usd.give, PAD, top, cardWidth, cardHeight, data, colors);
  sideCard(
    ctx,
    data.partner,
    data.receive,
    balance.receive,
    data.usd.receive,
    PAD + cardWidth + GAP,
    top,
    cardWidth,
    cardHeight,
    data,
    colors,
  );

  // Net result for the signed-in user.
  roundRect(ctx, PAD, netTop, PROOF_WIDTH - PAD * 2, 76, 18);
  ctx.fillStyle = colors.card;
  ctx.fill();
  ctx.strokeStyle = colors.border;
  ctx.stroke();
  const verdict = balance.valueDelta > 0 ? colors.win : balance.valueDelta < 0 ? colors.loss : colors.text;
  const pct = percentChange(balance.valueDelta, balance.give.value);
  const label = `Net for ${data.me.displayName || data.me.name}`;
  const labelWidth = text(ctx, label, PAD + CARD_PAD, netTop + 46, { font: font(600, 15), color: colors.text2 });
  const deltaWidth = text(
    ctx,
    formatDelta(balance.valueDelta, data.compact),
    PAD + CARD_PAD + labelWidth + 16,
    netTop + 47,
    {
      font: font(700, 24),
      color: verdict,
    },
  );
  if (pct !== null && balance.valueDelta !== 0) {
    text(ctx, formatPercent(pct), PAD + CARD_PAD + labelWidth + 16 + deltaWidth + 10, netTop + 46, {
      font: font(600, 15),
      color: verdict,
    });
  }
  const usdDelta =
    data.usd.give && data.usd.receive
      ? {
          value: data.usd.receive.value - data.usd.give.value,
          estimated: data.usd.give.estimated || data.usd.receive.estimated,
        }
      : null;
  const extras = [
    `RAP ${formatDelta(balance.rapDelta, data.compact)}`,
    usdDelta ? `USD ${usdDelta.estimated ? '≈' : ''}${formatUsdDelta(usdDelta.value, data.compact)}` : '',
  ]
    .filter(Boolean)
    .join('   ·   ');
  text(ctx, extras, PROOF_WIDTH - PAD - CARD_PAD, netTop + 46, {
    font: font(600, 15),
    color: colors.text2,
    align: 'right',
  });

  // Footer: where the figures come from.
  const unlisted = [...data.give.items, ...data.receive.items].filter((entry) => !entry.item).length;
  const footer = [
    `Values from ${data.sources} as of ${timeFormat.format(data.valuesAt)}`,
    unlisted ? `${unlisted} unvalued ${unlisted === 1 ? 'item' : 'items'} not counted` : '',
    'Generated with RoLens',
  ]
    .filter(Boolean)
    .join('  ·  ');
  text(ctx, footer, PAD, footerY, { font: font(500, 12.5), color: colors.text3, max: PROOF_WIDTH - PAD * 2 });
  return canvas;
}
