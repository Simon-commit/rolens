import { beforeEach, describe, expect, it } from 'vitest';
import { findItemCards, RARE_ATTR, renderBadges } from '../src/content/badges';
import { removeOwnNodes } from '../src/content/dom';
import { renderItemPanel } from '../src/content/item-panel';
import { findTradeOffers, renderTradeSummary } from '../src/content/trade-summary';
import type { RenderContext } from '../src/content/ui/context';
import { buildHoverCard } from '../src/content/ui/hover-card';
import { applyThemePreference, detectTheme } from '../src/content/ui/shadow';
import { tradeSummaryText } from '../src/content/ui/trade-card';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { balanceTrade, totalSide } from '../src/core/trade';
import { rolimons } from '../src/providers/rolimons';
import { item } from './fixtures/items';
import { itemPage, tradePage } from './fixtures/trade-page';

const table = new Map([
  [1, item({ id: 1, name: 'Valued Hat', acronym: 'VH', rap: 1000, value: 1500, demand: 'high', trend: 'stable' })],
  [2, item({ id: 2, name: 'Unvalued Hat', rap: 800 })],
  [3, item({ id: 3, name: 'Projected Hat', rap: 5000, value: 4000, projected: true, rare: true })],
]);
const lookup = (id: number) => table.get(id) ?? null;
const ctx: RenderContext = { settings: DEFAULT_SETTINGS, provider: rolimons, status: null };
const withRate: RenderContext = { ...ctx, settings: { ...DEFAULT_SETTINGS, usdRate: 4 } };

const shadowText = (host: Element | null | undefined) => host?.shadowRoot?.textContent ?? '';
const setBody = (html: string) => {
  document.body.innerHTML = html; // eslint-disable-line no-restricted-properties
};

describe('value chips', () => {
  beforeEach(() => setBody(tradePage));

  it('finds one card per item, not one per link', () => {
    expect([...findItemCards(document).values()]).toEqual([1, 2, 3, 999]);
  });

  it('adds a chip to each known item only, isolated in Shadow DOM', () => {
    renderBadges(findItemCards(document), lookup, ctx);
    const chips = [...document.querySelectorAll<HTMLElement>('[data-rolens="badge"]')];
    expect(chips.map((chip) => chip.dataset.rolensId)).toEqual(['1', '2', '3']);
    expect(chips.every((chip) => chip.shadowRoot)).toBe(true);
    expect(shadowText(chips[0])).toContain('1,500');
    expect(shadowText(chips[1])).toContain('RAP800');
    expect(chips[2]?.shadowRoot?.querySelector('.chip')?.classList.contains('is-projected')).toBe(true);
  });

  it('marks rare items and their cards', () => {
    renderBadges(findItemCards(document), lookup, ctx);
    const rareCards = [...document.querySelectorAll(`[${RARE_ATTR}]`)];
    expect(rareCards).toHaveLength(1);
    expect(rareCards[0]?.querySelector('[data-rolens="badge"]')?.getAttribute('data-rolens-id')).toBe('3');
  });

  it('shows USD only when a rate or source provides it', () => {
    renderBadges(findItemCards(document), lookup, ctx);
    expect(shadowText(document.querySelector('[data-rolens="badge"]'))).not.toContain('$');
    removeOwnNodes(document);
    renderBadges(findItemCards(document), lookup, withRate);
    expect(shadowText(document.querySelector('[data-rolens="badge"]'))).toContain('$6.00');
  });

  it('is idempotent so the MutationObserver settles', () => {
    renderBadges(findItemCards(document), lookup, ctx);
    const first = document.querySelector('[data-rolens="badge"]');
    renderBadges(findItemCards(document), lookup, ctx);
    expect(document.querySelector('[data-rolens="badge"]')).toBe(first);
    expect(document.querySelectorAll('[data-rolens="badge"]')).toHaveLength(3);
  });

  it('renders item names as text, never as markup', () => {
    const evil = item({ id: 1, name: '<img src=x onerror=alert(1)>', value: 1 });
    const nodes = buildHoverCard(evil, ctx);
    expect(nodes.some((node) => node.querySelector('img'))).toBe(false);
    expect(nodes[0]?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('can be fully removed', () => {
    renderBadges(findItemCards(document), lookup, ctx);
    removeOwnNodes(document);
    expect(document.querySelector('[data-rolens]')).toBeNull();
    expect(document.querySelector(`[${RARE_ATTR}]`)).toBeNull();
  });
});

describe('hover card', () => {
  it('shows full stats, flags and the RAP insight', () => {
    const text = buildHoverCard(table.get(3)!, withRate)
      .map((node) => node.textContent)
      .join(' ');
    expect(text).toContain('Projected Hat');
    expect(text).toContain('RAP is 25% above value');
    expect(text).toContain('$16.00');
    expect(text).toContain('Rare');
    expect(text).toContain('Projected');
  });

  it('shows a source USD estimate with its confidence and range', () => {
    const withUsd = item({
      id: 9,
      value: 1000,
      usd: { value: 42, low: 38, high: 46, confidence: 'high', origin: 'routility' },
    });
    const text = buildHoverCard(withUsd, ctx)
      .map((node) => node.textContent)
      .join(' ');
    expect(text).toContain('$42.00');
    expect(text).toContain('$38.00–$46.00');
    expect(text).toContain('High confidence');
  });
});

describe('RoUtility in the UI', () => {
  const withSecondValue = item({
    id: 7,
    name: 'Contested Hat',
    value: 100_000,
    rap: 90_000,
    usd: { value: 350, confidence: 'high', origin: 'routility', rate: 3.5 },
    routility: {
      value: 130_000,
      usd: 350,
      rate: 3.5,
      confidence: 'high',
      confidenceReason: 'Many recent sales',
      rare: false,
      projected: false,
      hyped: false,
      copies: 1200,
    },
  });

  it('shows USD with confidence, the second value and a disagreement warning', () => {
    const text = buildHoverCard(withSecondValue, ctx)
      .map((node) => node.textContent)
      .join(' ');
    expect(text).toContain('$350');
    expect(text).toContain('High confidence · $3.50/1K');
    expect(text).toContain('RoUtility value130K+30%');
    expect(text).toContain('Sources disagree');
    expect(text).toContain('1,200');
    expect(text).toContain("Rolimon's & RoUtility");
  });

  it('does not warn when the sources roughly agree', () => {
    const close = { ...withSecondValue, routility: { ...withSecondValue.routility!, value: 105_000 } };
    const text = buildHoverCard(close, ctx)
      .map((node) => node.textContent)
      .join(' ');
    expect(text).not.toContain('Sources disagree');
  });
});

describe('trade card', () => {
  beforeEach(() => setBody(tradePage));

  it('identifies give and receive sides from the headers', () => {
    const offers = findTradeOffers(document);
    expect(offers?.give.ids).toEqual([1, 2]);
    expect(offers?.receive.ids).toEqual([3, 999]);
  });

  it('computes and renders the win/loss', () => {
    const balance = renderTradeSummary(document, lookup, withRate);
    expect(balance?.valueDelta).toBe(4000 - 2300);
    const card = document.querySelector<HTMLElement>('[data-rolens="trade"]');
    expect(card?.dataset.verdict).toBe('win');
    const text = shadowText(card);
    expect(text).toContain('+1,700');
    expect(text).toContain('Win +73.9%');
    expect(text).toContain('+$6.80');
    expect(text).toContain('2,300 → 4,000');
    expect(text).toContain('Projected');
    expect(card?.shadowRoot?.querySelector('.flag--rare')?.getAttribute('aria-label')).toBe(
      'Rare items. 1 item in this trade is rare, with few copies in circulation.',
    );
    expect(card?.shadowRoot?.querySelector('.usd-delta')?.classList.contains('is-loss')).toBe(false);
    expect(card?.nextElementSibling?.classList.contains('trade-list-detail-offer')).toBe(true);
  });

  it('shows a USD loss in red', () => {
    const cheapGet = new Map(table);
    cheapGet.set(3, item({ id: 3, name: 'Cheap Hat', rap: 100, value: 100 }));
    renderTradeSummary(document, (id) => cheapGet.get(id) ?? null, withRate);
    const usd = document.querySelector('[data-rolens="trade"]')?.shadowRoot?.querySelector('.usd-delta');
    expect(usd?.textContent?.startsWith('−$')).toBe(true);
    expect(usd?.classList.contains('is-loss')).toBe(true);
  });

  it('explains each warning in a tooltip on hover', () => {
    renderTradeSummary(document, lookup, ctx);
    const projected = document
      .querySelector('[data-rolens="trade"]')
      ?.shadowRoot?.querySelector<HTMLElement>('.flag--warn');
    projected?.dispatchEvent(new MouseEvent('mouseenter'));
    const tip = document.querySelector('[data-rolens="tooltip"]')?.shadowRoot?.querySelector('.tip');
    expect(tip?.textContent).toContain('Projected RAP');
    expect(tip?.textContent).toContain('inflated sales');
    expect(projected?.tabIndex).toBe(0);
  });

  it('adds a compact total beside each side heading', () => {
    renderTradeSummary(document, lookup, ctx);
    const totals = [...document.querySelectorAll('.trade-list-detail-offer-header [data-rolens="side-total"]')];
    expect(totals.map((node) => node.shadowRoot?.querySelector('.t')?.textContent)).toEqual([
      '2,300RAP 1,800',
      '4,000RAP 5,000',
    ]);
    renderTradeSummary(document, lookup, ctx);
    expect(document.querySelectorAll('[data-rolens="side-total"]')).toHaveLength(2);
  });

  it('starts collapsed, expands on click and remembers the choice', () => {
    const saved: boolean[] = [];
    renderTradeSummary(document, lookup, { ...ctx, saveTradeDetails: (open) => saved.push(open) });
    const wrap = document.querySelector('[data-rolens="trade"]')?.shadowRoot?.querySelector('.wrap');
    expect(wrap?.classList.contains('is-open')).toBe(false);
    const toggle = wrap?.querySelector<HTMLButtonElement>('button[aria-expanded]');
    toggle?.click();
    expect(wrap?.classList.contains('is-open')).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(saved).toEqual([true]);
  });

  it('leaves USD out when any item lacks an estimate', () => {
    renderTradeSummary(document, lookup, ctx);
    expect(shadowText(document.querySelector('[data-rolens="trade"]'))).not.toContain('$');
  });

  it('writes a plain-text summary for sharing', () => {
    const find = (id: number) => table.get(id);
    const give = [table.get(1)!, table.get(2)!];
    const receive = [table.get(3)!];
    const text = tradeSummaryText(
      {
        balance: balanceTrade(totalSide([1, 2], find), totalSide([3], find)),
        give: { items: give, usd: null },
        receive: { items: receive, usd: null },
      },
      true,
    );
    expect(text).toBe(
      [
        'Give: VH, Unvalued Hat (2,300)',
        'Get: Projected Hat (4,000)',
        'Net: +1,700 value (+73.9%), +3,200 RAP',
        'Values: Rolimons via RoLens',
      ].join('\n'),
    );
  });

  it('does nothing outside a trade', () => {
    setBody('<div></div>');
    expect(renderTradeSummary(document, lookup, ctx)).toBeNull();
  });
});

describe('item page card', () => {
  it('inserts stats under the title row with a safe source link', () => {
    setBody(itemPage);
    renderItemPanel(document, table.get(1)!, ctx);
    const panel = document.querySelector('.item-details-name-row + [data-rolens="panel"]');
    const text = shadowText(panel);
    expect(text).toContain('1,500');
    expect(text).toContain('High');
    expect(text).toContain('RAP is 33% below value');
    const link = panel?.shadowRoot?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://www.rolimons.com/item/1');
    expect(link?.rel).toBe('noopener noreferrer');
  });
});

describe('theme', () => {
  it('follows Roblox theme classes', () => {
    document.body.className = 'dark-theme';
    expect(detectTheme()).toBe('dark');
    document.body.className = 'light-theme';
    expect(detectTheme()).toBe('light');
    document.body.className = '';
  });

  it('switches existing widgets in place when the user picks a theme', () => {
    setBody(tradePage);
    renderBadges(findItemCards(document), lookup, ctx);
    const chip = document.querySelector<HTMLElement>('[data-rolens="badge"]');
    applyThemePreference('dark');
    expect(chip?.dataset.theme).toBe('dark');
    applyThemePreference('light');
    expect(chip?.dataset.theme).toBe('light');
    applyThemePreference('auto');
  });
});
