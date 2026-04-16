/**
 * Waterfall tier utilities for styling and display
 * Waterfall tiers: survival, security, growth, lifestyle, unclassified
 */

import type { Category } from '$lib/core/db';

export type WaterfallTier = Category['waterfallTier'];

export interface WaterfallTierStyle {
	borderColor: string;
	borderStyle: 'solid' | 'dashed' | 'dotted';
	bgColor: string;
	textColor: string;
	label: string;
}

/**
 * Get waterfall tier styling information
 */
export function getWaterfallTierStyle(tier: WaterfallTier | null | undefined): WaterfallTierStyle {
	switch (tier) {
		case 'survival':
			return {
				borderColor: 'border-warm-coral',
				borderStyle: 'solid',
				bgColor: 'bg-warm-coral/5',
				textColor: 'text-warm-coral',
				label: 'Survival'
			};
		case 'security':
			return {
				borderColor: 'border-info',
				borderStyle: 'dashed',
				bgColor: 'bg-info/5',
				textColor: 'text-info',
				label: 'Security'
			};
		case 'growth':
			return {
				borderColor: 'border-sage-green',
				borderStyle: 'solid',
				bgColor: 'bg-sage-green/5',
				textColor: 'text-sage-green',
				label: 'Growth'
			};
		case 'lifestyle':
			return {
				borderColor: 'border-golden-amber',
				borderStyle: 'dotted',
				bgColor: 'bg-golden-amber/5',
				textColor: 'text-golden-amber',
				label: 'Lifestyle'
			};
		case 'unclassified':
			return {
				borderColor: 'border-text-tertiary',
				borderStyle: 'dotted',
				bgColor: 'bg-bg-tertiary',
				textColor: 'text-text-tertiary',
				label: 'Unclassified'
			};
		default:
			return {
				borderColor: 'border-text-tertiary',
				borderStyle: 'solid',
				bgColor: 'bg-bg-tertiary',
				textColor: 'text-text-tertiary',
				label: 'Uncategorized'
			};
	}
}

/**
 * Get border classes for waterfall tier
 */
export function getWaterfallTierBorder(tier: WaterfallTier | null | undefined): string {
	const style = getWaterfallTierStyle(tier);
	// Use proper Tailwind classes - border-l-4 for width, then color, then style
	return `border-l-4 ${style.borderColor} ${style.borderStyle === 'dashed' ? 'border-dashed' : style.borderStyle === 'dotted' ? 'border-dotted' : 'border-solid'}`;
}

/**
 * Get waterfall tier label
 */
export function getWaterfallTierLabel(tier: WaterfallTier | null | undefined): string {
	return getWaterfallTierStyle(tier).label;
}
