import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm']
	},
	test: {
		include: ['src/**/*.test.ts']
	}
});
