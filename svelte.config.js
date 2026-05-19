import { preprocessMeltUI, sequence } from '@melt-ui/pp';
import adapterStatic from '@sveltejs/adapter-static';
import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isPwaDeploy = process.env.BUILD_TARGET === 'pwa';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: sequence([vitePreprocess(), preprocessMeltUI()]),
	kit: {
		adapter: isPwaDeploy
			? adapterNode({
					out: 'build',
					precompress: false
				})
			: adapterStatic({
					pages: 'build',
					assets: 'build',
					fallback: 'index.html',
					strict: false
				}),
		prerender: isPwaDeploy
			? { entries: [], handleUnseenRoutes: 'ignore' }
			: {
					handleHttpError: ({ message }) => {
						if (message.includes('Not found')) {
							return;
						}
						throw new Error(message);
					},
					handleUnseenRoutes: ({ path }) => {
						if (!path || path.includes('[id]') || path.includes('[...id]')) {
							return;
						}
						throw new Error(`Unseen route: ${path}`);
					}
				}
	}
};

export default config;
