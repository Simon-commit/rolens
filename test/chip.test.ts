import { describe, expect, it } from 'vitest';
import type { RenderContext } from '../src/content/ui/context';
import { roomFor } from '../src/content/chip-fit';
import { createChip, shrinkToFit } from '../src/content/ui/chip';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { item } from './fixtures/items';

const ctx: RenderContext = {
  settings: { ...DEFAULT_SETTINGS, compactNumbers: false, usdRate: 3 },
  status: null,
};

/** jsdom has no layout: the chip is as wide as its text, 7px per character. */
function overlay(thumbWidth: number) {
  const thumb = document.createElement('div');
  thumb.getBoundingClientRect = () => new DOMRect(0, 0, thumbWidth, thumbWidth);
  const host = createChip(item({ id: 5, name: 'Big Hat', rap: 1_400_000, value: 1_500_000 }), ctx);
  host.dataset.placement = 'overlay';
  thumb.append(host);
  const chip = host.shadowRoot!.querySelector<HTMLElement>('.chip')!;
  chip.getBoundingClientRect = () => new DOMRect(0, 0, (chip.textContent ?? '').length * 7, 30);
  return { host, chip };
}

describe('overlay chips', () => {
  it('keep full figures when they fit', () => {
    const { host, chip } = overlay(200);
    shrinkToFit(host, roomFor(host, host.parentElement!));
    expect(chip.textContent).toBe('1,500,000≈$4,500');
  });

  it('abbreviate figures rather than overflow the thumbnail', () => {
    const { host, chip } = overlay(110);
    shrinkToFit(host, roomFor(host, host.parentElement!));
    expect(chip.textContent).toBe('1.5M≈$4,500');
    expect(chip.classList.contains('is-narrow')).toBe(false);
  });

  it('leave USD to the hover card when even abbreviated figures are too wide', () => {
    const { host, chip } = overlay(80);
    shrinkToFit(host, roomFor(host, host.parentElement!));
    expect(chip.classList.contains('is-narrow')).toBe(true);
  });
});

describe('room for a chip', () => {
  it('keeps clear of the selection check Roblox adds to a tile', () => {
    const { host } = overlay(125);
    const check = document.createElement('div');
    check.className = 'item-card-equipped';
    check.getBoundingClientRect = () => new DOMRect(95, 6, 24, 24);
    host.parentElement!.append(check);
    expect(roomFor(host, host.parentElement!)).toBe(125 - 12 - 30);
  });

  it('ends a row chip before the price', () => {
    const card = document.createElement('div');
    card.getBoundingClientRect = () => new DOMRect(0, 0, 330, 60);
    const price = document.createElement('span');
    price.getBoundingClientRect = () => new DOMRect(64, 30, 70, 18);
    const host = document.createElement('span');
    host.dataset.placement = 'row';
    host.style.right = '50px';
    card.append(price, host);
    expect(roomFor(host, card, price)).toBe(330 - 50 - 134 - 8);
  });
});
