// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isSerialText, markSerials, SERIAL_ATTR, SERIALS_HIDDEN_ATTR, setSerialsHidden } from '../src/content/serials';

describe('isSerialText', () => {
  it('accepts the serial formats Roblox shows', () => {
    for (const text of ['#12', '# 12', '#100/1.000', '#1,234 / 5,000', 'Serial #7 of 500', 'Serial #7', ' #42 ']) {
      expect(isSerialText(text), text).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const text of [
      'Serial N/A',
      '#',
      '12',
      'Trade #3 was sent',
      'The Classic ROBLOX Fedora',
      '370.459',
      '',
      null,
    ]) {
      expect(isSerialText(text), String(text)).toBe(false);
    }
  });
});

describe('serial hiding', () => {
  afterEach(() => {
    setSerialsHidden(false);
    document.body.replaceChildren();
  });

  it('marks the whole label, including a "#" in its own span', () => {
    // eslint-disable-next-line no-restricted-properties
    document.body.innerHTML = `
      <div class="item-card"><span class="label"><span>#</span><span>1234</span></span><span class="name">SKOTN</span></div>
      <p>Serial #7 of 500</p>
      <span class="limited"><span>LTD U</span><span>#</span><span>412</span></span>
      <p>Trade #3 was sent</p>`;
    markSerials(document);
    const marked = [...document.querySelectorAll(`[${SERIAL_ATTR}]`)].map((node) => node.textContent);
    expect(marked).toEqual(['#1234', 'Serial #7 of 500', '#', '412']);
  });

  it('hides serial titles and restores them exactly', () => {
    document.body.innerHTML = '<div id="a" title="#100/1.000"></div><div id="b" title="Serial N/A"></div>'; // eslint-disable-line no-restricted-properties
    setSerialsHidden(true);
    expect(document.documentElement.hasAttribute(SERIALS_HIDDEN_ATTR)).toBe(true);
    expect(document.querySelector('#a')?.getAttribute('title')).toBe('Serial hidden by RoLens');
    expect(document.querySelector('#b')?.getAttribute('title')).toBe('Serial N/A');
    setSerialsHidden(false);
    expect(document.documentElement.hasAttribute(SERIALS_HIDDEN_ATTR)).toBe(false);
    expect(document.querySelector('#a')?.getAttribute('title')).toBe('#100/1.000');
  });

  it('marks serials Roblox renders later', async () => {
    setSerialsHidden(true);
    const card = document.createElement('div');
    card.innerHTML = '<span class="serial">#55</span><span>Sparkle Time Fedora</span>'; // eslint-disable-line no-restricted-properties
    document.body.append(card);
    await Promise.resolve();
    expect(card.querySelector('.serial')?.hasAttribute(SERIAL_ATTR)).toBe(true);
  });
});
