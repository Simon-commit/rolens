import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'https://www.roblox.com/trades' } },
    include: ['test/**/*.test.ts'],
  },
});
