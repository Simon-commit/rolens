import { describe, expect, it } from 'vitest';
import { catalogIdFromHref, catalogIdFromPath } from '../src/content/selectors';

describe('catalogIdFromHref', () => {
  it('reads ids from absolute and relative links', () => {
    expect(catalogIdFromHref('https://www.roblox.com/catalog/1029025/The-Classic-ROBLOX-Fedora')).toBe(1029025);
    expect(catalogIdFromHref('/catalog/1029025')).toBe(1029025);
    expect(catalogIdFromHref('/catalog/1029025/')).toBe(1029025);
  });

  it('ignores non-item and non-Roblox links', () => {
    expect(catalogIdFromHref('/catalog?Category=1')).toBeNull();
    expect(catalogIdFromHref('https://evil.example/catalog/1')).toBeNull();
    expect(catalogIdFromHref('https://roblox.com.evil.example/catalog/1')).toBeNull();
    expect(catalogIdFromHref('/catalog/12abc')).toBeNull();
  });

  it('reads ids from page paths', () => {
    expect(catalogIdFromPath('/catalog/42/Name')).toBe(42);
    expect(catalogIdFromPath('/trades')).toBeNull();
  });
});
