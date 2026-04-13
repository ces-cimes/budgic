import type { ComponentType } from 'svelte';

// Tab header visual variants (for unified TabHeader styling)
export type TabHeaderVariant = 'pill' | 'underline';

// Core tab interface types
export interface TabConfig {
	id: string;
	label: string;
	icon?: any; // Lucide icon component
}

// Shared UI component types
export interface ActionButtonProps {
	icon: any; // Lucide icon component
	label: string;
	subtitle?: string;
	onClick: () => void;
	variant?: 'default' | 'outline' | 'ghost';
	className?: string;
}

export interface QuickStatsCardProps {
	title: string;
	value: string | number;
	subtitle?: string;
	icon?: any; // Lucide icon component
	trend?: TrendData;
	className?: string;
}

export interface TimeRangeSelectorProps {
	value: string;
	options: string[];
	onChange: (value: string) => void;
	label?: string;
	className?: string;
}

export interface TrendData {
	label: string;
	value: number;
	isPositive: boolean;
	previousValue?: number;
}

// Tab component props
export interface TabContentProps {
	tabId: string;
	isActive: boolean;
	className?: string;
	children: any;
	tabs: any[]; // Array of tabs to infer count from
}

export interface TabContentWrapperProps {
	tabs: TabConfig[];
	activeTab: string;
	onTabChange: (tabId: string) => void;
	className?: string;
	class?: string;
	children: any;
}
