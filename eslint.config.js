import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	{
		ignores: [
			'android/app/src/main/assets/**',
			'ios/App/App/public/**',
			'build/**',
			'.svelte-kit/**',
			'dist/**'
		]
	},
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'no-undef': 'off',
			'no-unused-vars': [
				'warn',
				{
					vars: 'all',
					args: 'after-used',
					caughtErrors: 'all',
					ignoreRestSiblings: false,
					reportUsedIgnorePattern: false
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	// Intentional ESLint allowlist (see docs/actionable/CHECKLIST_FEATURES.md — lint item).
	// Prettier is the hard gate; rules below stay off so `npm run lint` passes while legacy
	// debt is fixed incrementally. Re-enable one rule at a time when ready.
	{
		files: ['**/*.{js,ts,svelte}'],
		rules: {
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'svelte/prefer-writable-derived': 'off',
			'svelte/prefer-svelte-reactivity': 'off',
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/require-each-key': 'off',
			'svelte/no-useless-mustaches': 'off',
			'svelte/no-useless-children-snippet': 'off',
			'no-case-declarations': 'off',
			'@typescript-eslint/no-unused-expressions': 'off',
			'prefer-const': 'warn',
			'no-ex-assign': 'off',
			'no-empty': 'warn'
		}
	}
);
