// Date grouping utilities for transaction display
// This logic is used by TransactionList and other components that need to group transactions by date

export interface DateGroup {
	key: string;
	date: Date;
	label: string;
}

export type GroupingMode = 'smart' | 'simple';

export function getGroupKey(date: Date, mode: GroupingMode = 'smart'): string {
	if (mode === 'simple') {
		return getSimpleGroupKey(date);
	}
	return getSmartGroupKey(date);
}

export function getSimpleGroupKey(date: Date): string {
	// Simple grouping by exact date (YYYY-MM-DD)
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function getSmartGroupKey(date: Date): string {
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	
	// Reset time to start of day for comparison
	const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
	
	if (dateOnly.getTime() === todayOnly.getTime()) {
		return 'today';
	} else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
		return 'yesterday';
	} else if (isInCurrentWeek(dateOnly)) {
		return 'this_week';
	} else if (isInLastWeek(dateOnly)) {
		return 'last_week';
	} else if (isInNextWeek(dateOnly)) {
		return 'next_week';
	} else if (dateOnly > todayOnly) {
		// Future dates beyond next week
		const weekStart = getWeekStart(dateOnly);
		return `future_${weekStart.toISOString().split('T')[0]}`;
	} else {
		// Past dates beyond last week
		const weekStart = getWeekStart(dateOnly);
		return `past_${weekStart.toISOString().split('T')[0]}`;
	}
}

export function getGroupDate(groupKey: string): Date {
	const today = new Date();
	
	switch (groupKey) {
		case 'today':
			return today;
		case 'yesterday':
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);
			return yesterday;
		case 'this_week':
			return getWeekStart(today);
		case 'last_week':
			const lastWeek = new Date(today);
			lastWeek.setDate(lastWeek.getDate() - 7);
			return getWeekStart(lastWeek);
		case 'next_week':
			const nextWeek = new Date(today);
			nextWeek.setDate(nextWeek.getDate() + 7);
			return getWeekStart(nextWeek);
		default:
			if (groupKey.startsWith('future_') || groupKey.startsWith('past_')) {
				const dateStr = groupKey.split('_')[1];
				return new Date(dateStr);
			}
			return today;
	}
}

export function getGroupLabel(groupKey: string, mode: GroupingMode = 'smart'): string {
	if (mode === 'simple') {
		return getSimpleGroupLabel(groupKey);
	}
	return getSmartGroupLabel(groupKey);
}

export function getSimpleGroupLabel(groupKey: string): string {
	// Parse YYYY-MM-DD format and return formatted date
	const date = new Date(groupKey + 'T00:00:00');
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	
	// Reset time for comparison
	const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
	
	if (dateOnly.getTime() === todayOnly.getTime()) {
		return 'Today';
	} else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
		return 'Yesterday';
	} else {
		// Format as "Mon, Dec 25" or "Mon, Dec 25, 2023" if different year
		const currentYear = today.getFullYear();
		const dateYear = date.getFullYear();
		
		if (dateYear === currentYear) {
			return date.toLocaleDateString(undefined, { 
				weekday: 'short', 
				month: 'short', 
				day: 'numeric' 
			});
		} else {
			return date.toLocaleDateString(undefined, { 
				weekday: 'short', 
				month: 'short', 
				day: 'numeric',
				year: 'numeric'
			});
		}
	}
}

export function getSmartGroupLabel(groupKey: string): string {
	switch (groupKey) {
		case 'today':
			return 'Today';
		case 'yesterday':
			return 'Yesterday';
		case 'this_week':
			return 'This week';
		case 'last_week':
			return 'Last week';
		case 'next_week':
			return 'Next week';
		default:
			if (groupKey.startsWith('future_')) {
				const dateStr = groupKey.split('_')[1];
				const date = new Date(dateStr);
				const today = new Date();
				const daysDiff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
				
				if (daysDiff <= 14) {
					return `In ${daysDiff} days`;
				} else {
					return date.toLocaleDateString(undefined, { 
						weekday: 'long', 
						month: 'short', 
						day: 'numeric' 
					});
				}
			} else if (groupKey.startsWith('past_')) {
				const dateStr = groupKey.split('_')[1];
				const date = new Date(dateStr);
				const today = new Date();
				const daysDiff = Math.ceil((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
				
				if (daysDiff <= 14) {
					return `${daysDiff} days ago`;
				} else {
					return date.toLocaleDateString(undefined, { 
						weekday: 'long', 
						month: 'short', 
						day: 'numeric' 
					});
				}
			}
			return 'Other';
	}
}

export function getWeekStart(date: Date): Date {
	const day = date.getDay();
	const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
	return new Date(date.getFullYear(), date.getMonth(), diff);
}

export function isInCurrentWeek(date: Date): boolean {
	const today = new Date();
	const weekStart = getWeekStart(today);
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);
	
	return date >= weekStart && date <= weekEnd;
}

export function isInLastWeek(date: Date): boolean {
	const today = new Date();
	const lastWeekStart = new Date(today);
	lastWeekStart.setDate(lastWeekStart.getDate() - 7);
	const lastWeekStartDate = getWeekStart(lastWeekStart);
	const lastWeekEnd = new Date(lastWeekStartDate);
	lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
	
	return date >= lastWeekStartDate && date <= lastWeekEnd;
}

export function isInNextWeek(date: Date): boolean {
	const today = new Date();
	const nextWeekStart = new Date(today);
	nextWeekStart.setDate(nextWeekStart.getDate() + 7);
	const nextWeekStartDate = getWeekStart(nextWeekStart);
	const nextWeekEnd = new Date(nextWeekStartDate);
	nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
	
	return date >= nextWeekStartDate && date <= nextWeekEnd;
} 