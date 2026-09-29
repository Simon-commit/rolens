import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '*.zip'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
    rules: {
      // Safety rules: RoLens never turns strings into code or markup.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent or the el() helper.' },
        { property: 'outerHTML', message: 'Use textContent or the el() helper.' },
        { property: 'insertAdjacentHTML', message: 'Use the el() helper.' },
        { object: 'document', property: 'write', message: 'Never write raw HTML.' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['scripts/**', 'test/e2e/**', '*.config.*'],
    languageOptions: { globals: globals.node },
  },
);
