import { preprocessMeltUI, sequence } from '@melt-ui/pp';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
	preprocess: sequence([vitePreprocess(), preprocessMeltUI()]),
	kit: {
		adapter: adapter({
			fallback: 'index.html',
			strict: false
		}),
		prerender: {
			handleHttpError: ({ path, referrer, message }) => {
				// Ignore missing files during prerender
				if (message.includes('Not found')) {
					return;
				}
				throw new Error(message);
			},
			handleUnseenRoutes: ({ path }) => {
				// Handle dynamic routes that can't be prerendered
				if (!path || path.includes('[id]') || path.includes('[...id]')) {
					return;
				}
				throw new Error(`Unseen route: ${path}`);
			}
		}
	}
};

export default config;
