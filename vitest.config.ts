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
