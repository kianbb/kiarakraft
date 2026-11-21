import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    '.lighthouseci/**',
    '.local/**',
    '.vercel/**',
    '.worktrees/**',
    'node_modules.backup/**',
  ]),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    // This Next preset introduces the compiler rule. Keep its reports
    // visible while auditing the application's existing hydration effects.
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
  {
    files: ['playwright.config.js', 'e2e/**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
