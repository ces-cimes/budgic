import type { Config } from 'tailwindcss';

const config: Config = {
	content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/layerchart/**/*.{svelte,js}'],
	theme: {
		extend: {
			colors: {
				// Warm Midnight Dark Mode Colors
				'sage-green': '#4A7C59',
				'golden-amber': '#FFB347',
				'warm-coral': '#FF8A80',
				'warm-charcoal': '#1A1D23',
				'warm-ivory': '#F5F1E8',

				// Background layers
				'bg-primary': '#1A1D23',
				'bg-secondary': '#242831',
				'bg-tertiary': '#2D3339',
				'bg-surface': '#363C45',

				// Text hierarchy
				'text-primary': '#F5F1E8',
				'text-secondary': '#B8BCC8',
				'text-tertiary': '#8A8F98',
				'text-disabled': '#5A5F68',

				// Accent colors
				success: '#4A7C59',
				warning: '#E8B86D',
				alert: '#FF8A80',
				info: '#6B9BD1',

				// Confidence-based colors
				'high-confidence': '#4A7C59',
				'high-confidence-accent': '#D4AF37',
				'medium-confidence': '#C9A96E',
				'borrowed-future': '#FFAB91',
				overspent: '#FF8A80',

				// Daily spending states
				'fresh-day': '#242831',
				'moderate-spending': '#28252B',
				'high-velocity': '#FF8A80',
				cooldown: '#2C3E50',

				// Behavioral psychology colors
				'positive-reinforcement': '#FFD700',
				'momentum-alert': '#FF8A80'
			}
		}
	}
};

export default config;
