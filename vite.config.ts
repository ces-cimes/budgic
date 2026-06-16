import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

const isNativeBuild = process.env.BUILD_TARGET === 'native';
const isPwaBuild = process.env.BUILD_TARGET === 'pwa' || !process.env.BUILD_TARGET;

export default defineConfig({
	assetsInclude: ['**/*.wasm'],
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm']
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		}),
		...(isNativeBuild
			? []
			: [
					SvelteKitPWA({
						registerType: 'autoUpdate',
						injectRegister: 'auto',
						workbox: {
							globPatterns: [
								'**/*.{js,css,html,ico,png,svg,wasm,woff,woff2,webmanifest}'
							],
							cleanupOutdatedCaches: true,
							navigateFallback: '/index.html',
							navigateFallbackDenylist: [/^\/api\//]
						},
						manifest: {
							name: 'Budgic - Smart Financial Management',
							short_name: 'Budgic',
							description: 'Intelligent personal finance management',
							theme_color: '#3b82f6',
							background_color: '#1a1d23',
							display: 'standalone',
							orientation: 'portrait',
							scope: '/',
							start_url: '/',
							icons: [
								{
									src: '/icon-192.png',
									sizes: '192x192',
									type: 'image/png',
									purpose: 'any maskable'
								},
								{
									src: '/icon-512.png',
									sizes: '512x512',
									type: 'image/png',
									purpose: 'any maskable'
								}
							],
							categories: ['finance', 'productivity', 'utilities'],
							lang: 'en',
							dir: 'ltr'
						},
						devOptions: {
							enabled: true,
							type: 'module'
						}
					})
				])
	]
});
