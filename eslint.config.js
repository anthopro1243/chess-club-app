import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/*
 * Lint: catches real mistakes (undefined names, hook misuse) as errors, and
 * accessibility slips (a <tr onClick> with no keyboard path, an unlabelled
 * field) as errors too. `npm run lint` runs it; CI runs it on every PR.
 */
export default [
  { ignores: ['dist/', 'public/', 'node_modules/', 'docs/', 'research/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    settings: { react: { version: '18.3' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Fine for a page heading that receives focus on navigation, and
      // for autoFocus in a dialog the person just opened.
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: ['h1'], roles: ['tabpanel'] }],
    },
  },
  {
    // Tests, scripts and the Node-side engine transport.
    files: ['**/*.test.js', '**/*.engine-test.js', 'scripts/**', 'supabase/**', 'src/engine/nodeTransport.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
