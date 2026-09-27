import { beforeEach, describe, expect, it } from 'vitest';
import { ANCHOR_ATTR, fitChip } from '../src/content/chip-fit';

/** jsdom has no layout, so each element gets a fixed box. */
function box(node: Element, left: number, top: number, width: number, height: number): void {
  node.getBoundingClientRect = () => new DOMRect(left, top, width, height);
}

let card: HTMLElement;
let thumb: HTMLElement;
let column: HTMLElement;
let caption: HTMLElement;
let host: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  card = document.createElement('div');
  thumb = document.createElement('div');
  thumb.className = 'item-card-thumb-container';
  column = document.createElement('div');
  caption = document.createElement('div');
  caption.className = 'item-card-name';
  column.append(caption, document.createElement('span'));
  card.append(thumb, column);
  document.body.append(card);
  host = document.createElement('span');
  box(card, 0, 0, 120, 200);
});

describe('chip placement', () => {
  it('keeps the chip inline when it fits', () => {
    box(host, 0, 150, 100, 22);
    expect(fitChip(host, card, caption)).toBe(true);
    expect(host.parentElement).toBe(caption);
    expect(host.dataset.placement).toBe('inline');
  });

  it('moves the chip under the text when the caption clips it', () => {
    caption.style.overflow = 'hidden';
    box(caption, 0, 150, 60, 20);
    let calls = 0;
    // Inline it is cut off by the caption; below it fits within the card.
    host.getBoundingClientRect = () => (calls++ === 0 ? new DOMRect(40, 150, 100, 22) : new DOMRect(0, 170, 100, 22));
    expect(fitChip(host, card, caption)).toBe(true);
    expect(host.parentElement).toBe(column);
    expect(host.dataset.placement).toBe('below');
  });

  it('overlays the thumbnail when the card has no room', () => {
    box(host, 0, 190, 100, 22);
    expect(fitChip(host, card, caption)).toBe(true);
    expect(host.parentElement).toBe(thumb);
    expect(host.dataset.placement).toBe('overlay');
    expect(thumb.hasAttribute(ANCHOR_ATTR)).toBe(true);
  });

  it('waits when the card is not laid out yet', () => {
    box(card, 0, 0, 0, 0);
    expect(fitChip(host, card, caption)).toBe(false);
  });
});
