// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'node_modules/', 'tools/**/*.py', '.claude/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // src/core is the model and services: it must run without Phaser, content or the view
    // layers (the simulation is developed in node, and content is handed over through
    // `attach(...)` in main.ts). Types from those layers are fine: `import type` is erased.
    files: ['src/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phaser',
              message: 'src/core must not import Phaser at run time; use `import type`.',
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: [
                '@/content',
                '@/content/*',
                '@/assets',
                '@/assets/*',
                '@/scenes',
                '@/scenes/*',
                '@/ui',
                '@/ui/*',
                '@/world',
                '@/world/*',
                '@/debug/hooks',
                '@/debug/startParams',
              ],
              message:
                'src/core imports content, assets and the view layers only as `import type`; ' +
                'values arrive through `attach(...)` in src/main.ts. Of @/debug only globals is allowed.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    // A LocalText pair (src/core/locale/text.ts) in a template literal compiles and shows
    // `[object Object]`: only strings, numbers and booleans go into templates; a pair goes
    // through `tr(...)` first. Needs type information, so it is on for src/ only.
    files: ['src/**/*.ts'],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',
    },
  },
  {
    // Node scripts, config files and src/devtools (`npm run voyage-check`) run outside the
    // browser.
    files: ['*.{js,mjs,ts}', 'tools/**/*.{js,mjs}', 'src/devtools/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
