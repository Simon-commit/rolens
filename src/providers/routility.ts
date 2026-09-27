import type { ValueProvider } from './types';

/**
 * RoUtility has no documented public API at the time of writing. The provider is
 * registered so the settings UI can show it, and so wiring it up later is a
 * single-file change plus a host permission in the manifest.
 */
export const routility: ValueProvider = {
  id: 'routility',
  label: 'RoUtility',
  homepage: 'https://routility.io',
  available: false,
  unavailableReason: 'Coming soon: RoUtility has no public API yet.',
  fetchItems() {
    return Promise.reject(new Error('RoUtility is not available yet'));
  },
};
