import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: process.env.VITEST
		? {
				conditions: ['browser']
			}
		: undefined,
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm']
	},
	test: {
		environment: 'happy-dom',
		setupFiles: ['src/vitest-setup.ts'],
		include: ['src/**/*.test.ts'],
		// Several suites mock `$lib/core/db` through importOriginal, so most of their
		// wall time is module loading, not assertions. Under load that blows the 5s
		// default and the suite fails as a timeout instead of on a real assertion.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/lib/**/*.ts', 'src/lib/**/*.svelte'],
			exclude: [
				'src/lib/**/*.test.ts',
				'src/lib/**/*.svelte.ts',
				'src/lib/**/index.ts',
				'src/lib/paraglide/**'
			],
			thresholds: {
				lines: 10,
				functions: 7,
				branches: 9,
				statements: 9
			}
		}
	}
});
