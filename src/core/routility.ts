import { DEMANDS, TRENDS, type Confidence, type ItemValue, type RoutilityData } from './types';

/**
 * RoUtility per-item details. There's no documented API; this is the endpoint
 * routility.io's own item pages use, so it's parsed defensively and any surprise
 * means "no RoUtility data" rather than an error on the page.
 */
export const ROUTILITY_ORIGIN = 'https://routility.io';
export const routilityItemUrl = (id: number) => `${ROUTILITY_ORIGIN}/item/${id}/details`;

function num(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() !== '') value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function text(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Accepts "High"/"medium"/"LOW", or a score as 0-1 or 0-100. */
export function parseConfidence(value: unknown): Confidence | null {
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase();
    if (word === 'low' || word === 'medium' || word === 'high') return word;
    if (word === 'med' || word === 'moderate') return 'medium';
    if (word === 'very high') return 'high';
    if (word === 'very low') return 'low';
    value = Number(word.replace('%', ''));
  }
  const score = num(value);
  if (score === null) return null;
  const pct = score <= 1 ? score * 100 : score;
  if (pct > 100) return null;
  return pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low';
}

function word<T extends string>(options: readonly T[], value: unknown): T | null {
  const lower = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return options.find((option) => option === lower) ?? null;
}

export function parseRoutilityItem(body: unknown, expectedId: number): RoutilityData | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  if (Number(raw.item_id) !== expectedId) return null;
  return {
    name: text(raw.item_name),
    acronym: text(raw.item_acronym, 20),
    rap: num(raw.item_rap),
    demand: word(DEMANDS, raw.item_demand),
    trend: word(TRENDS, raw.item_trend),
    value: num(raw.item_value),
    usd: num(raw.item_usd),
    rate: num(raw.item_rate),
    confidence: parseConfidence(raw.item_confidence),
    confidenceReason: text(raw.item_confidence_reason),
    rare: raw.item_rare === true,
    projected: raw.item_projected === true,
    hyped: raw.item_hyped === true,
    copies: num(raw.item_copies),
  };
}

/** Layers RoUtility's data onto an item: its USD estimate, and its flags OR'd in. */
export function withRoutility(item: ItemValue, data: RoutilityData | null | undefined): ItemValue {
  if (!data) return item;
  const merged: ItemValue = {
    ...item,
    routility: data,
    rare: item.rare || data.rare,
    projected: item.projected || data.projected,
    hyped: item.hyped || data.hyped,
  };
  const usd = usdEstimate(data);
  if (usd) merged.usd = usd;
  return merged;
}

function usdEstimate(data: RoutilityData): ItemValue['usd'] {
  if (data.usd === null || data.usd <= 0) return undefined;
  return {
    value: data.usd,
    confidence: data.confidence,
    origin: 'routility',
    ...(data.confidenceReason ? { reason: data.confidenceReason } : {}),
    ...(data.rate !== null ? { rate: data.rate } : {}),
  };
}

/**
 * An item built from RoUtility alone, for when Rolimon's is turned off. Null when
 * RoUtility has neither a value nor a RAP for it.
 */
export function itemFromRoutility(id: number, data: RoutilityData): ItemValue | null {
  if (data.value === null && data.rap === null) return null;
  const usd = usdEstimate(data);
  return {
    id,
    name: data.name ?? `Item ${id}`,
    acronym: data.acronym ?? '',
    rap: data.rap ?? 0,
    value: data.value,
    demand: data.demand,
    trend: data.trend,
    projected: data.projected,
    hyped: data.hyped,
    rare: data.rare,
    ...(usd ? { usd } : {}),
  };
}

/** Share by which RoUtility's value differs from the main value; null when either is missing. */
export function valueDisagreement(item: ItemValue): number | null {
  const other = item.routility?.value;
  if (!other || !item.value) return null;
  return (other - item.value) / item.value;
}

/** Past this difference, RoLens warns that the sources disagree. */
export const DISAGREEMENT_THRESHOLD = 0.15;
