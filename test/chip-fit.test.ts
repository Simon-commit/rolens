import { beforeEach, describe, expect, it } from 'vitest';
import { ANCHOR_ATTR, fitChip } from '../src/content/chip-fit';

/** jsdom has no layout, so each element gets a fixed box. */
function box(node: Element, left: number, top: number, width: number, height: number): void {
  node.getBoundingClientRect = () => new DOMRect(left, top, width, height);
}

let card: HTMLElement;
let thumb: HTMLElement;
let caption: HTMLElement;
let host: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  card = document.createElement('div');
  thumb = document.createElement('div');
  thumb.className = 'item-card-thumb-container';
  caption = document.createElement('div');
  caption.className = 'item-card-name';
  const price = document.createElement('span');
  card.append(thumb, caption, price);
  document.body.append(card);
  host = document.createElement('span');
  box(host, 0, 0, 100, 22);
});

describe('chip placement', () => {
  it('floats over the thumbnail in tiles, leaving the card layout untouched', () => {
    box(card, 0, 0, 125, 215);
    box(thumb, 0, 0, 125, 125);
    expect(fitChip(host, card, caption)).toBe(true);
    expect(host.parentElement).toBe(thumb);
    expect(host.dataset.placement).toBe('overlay');
    expect(thumb.hasAttribute(ANCHOR_ATTR)).toBe(true);
    expect(caption.children).toHaveLength(0);
  });

  it('sits right-aligned beside the price in list rows, below the name', () => {
    box(card, 0, 100, 330, 70);
    box(thumb, 10, 113, 44, 44);
    box(caption, 64, 110, 200, 22);
    expect(fitChip(host, card, caption)).toBe(true);
    expect(host.parentElement).toBe(card);
    expect(host.dataset.placement).toBe('row');
    expect(card.hasAttribute(ANCHOR_ATTR)).toBe(true);
    // Name ends 32px into the row; the chip is centred in the 38px below it.
    expect(host.style.top).toBe('40px');
    expect(host.style.right).toBe('10px');
  });

  it('lines a row chip up with the price, whatever the name does', () => {
    box(card, 0, 100, 330, 60);
    box(thumb, 10, 110, 40, 40);
    box(caption, 64, 108, 240, 22);
    const price = document.createElement('span');
    box(price, 64, 134, 70, 18);
    fitChip(host, card, caption, price);
    // Price line centre is 43px into the row; the 22px chip is centred on it.
    expect(host.style.top).toBe('32px');
  });

  it("keeps row chips clear of Roblox's remove button", () => {
    box(card, 0, 100, 330, 60);
    box(thumb, 10, 110, 40, 40);
    const remove = document.createElement('button');
    remove.className = 'trade-request-item-remove';
    card.prepend(remove);
    box(remove, 284, 114, 32, 32);
    fitChip(host, card, caption);
    expect(host.style.right).toBe('54px');
    // Hidden until hover: space is still kept for it.
    box(remove, 0, 0, 0, 0);
    fitChip(host, card, caption);
    expect(host.style.right).toBe('50px');
  });

  it('centres a row chip when there is no room under the name', () => {
    box(card, 0, 0, 330, 40);
    box(thumb, 10, 4, 32, 32);
    box(caption, 50, 4, 200, 30);
    fitChip(host, card, caption);
    expect(host.style.top).toBe('9px');
  });

  it('stays in the caption when the card has no thumbnail', () => {
    thumb.remove();
    box(card, 0, 0, 200, 60);
    fitChip(host, card, caption);
    expect(host.parentElement).toBe(caption);
    expect(host.dataset.placement).toBe('inline');
  });

  it('waits when the card is not laid out yet', () => {
    box(card, 0, 0, 0, 0);
    expect(fitChip(host, card, caption)).toBe(false);
  });
});
