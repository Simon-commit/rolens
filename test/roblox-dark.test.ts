import { beforeEach, describe, expect, it } from 'vitest';
import { isRobloxDark, setRobloxDark, watchRobloxTheme } from '../src/content/roblox-dark';
import { detectTheme } from '../src/content/ui/shadow';

describe('dark Roblox', () => {
  beforeEach(() => {
    setRobloxDark(false);
    document.body.className = 'rbx-body light-theme';
    document.body.replaceChildren();
  });

  it('switches Roblox to its dark styles and restores exactly what it changed', () => {
    const panel = document.createElement('div');
    panel.className = 'light-theme panel';
    const alreadyDark = document.createElement('div');
    alreadyDark.className = 'dark-theme';
    document.body.append(panel, alreadyDark);

    setRobloxDark(true);
    expect(isRobloxDark()).toBe(true);
    expect(document.body.className).toBe('rbx-body dark-theme');
    expect(panel.className).toBe('dark-theme panel');
    expect(detectTheme()).toBe('dark');

    setRobloxDark(false);
    expect(document.body.className).toBe('rbx-body light-theme');
    expect(panel.className).toBe('light-theme panel');
    expect(alreadyDark.className).toBe('dark-theme');
  });

  it('keeps new and reset parts of the page dark', async () => {
    const observer = watchRobloxTheme();
    setRobloxDark(true);
    const late = document.createElement('div');
    late.className = 'light-theme';
    document.body.append(late);
    document.body.classList.replace('dark-theme', 'light-theme');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(late.className).toBe('dark-theme');
    expect(document.body.classList.contains('dark-theme')).toBe(true);
    observer.disconnect();
  });

  it('leaves the page alone when off', () => {
    setRobloxDark(false);
    expect(document.body.className).toBe('rbx-body light-theme');
    expect(isRobloxDark()).toBe(false);
  });
});
