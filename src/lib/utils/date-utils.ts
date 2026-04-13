import { addDays, startOfDay, endOfDay, isWithinInterval, format } from 'date-fns';

export const dateUtils = {
	// WEEKS

	/**
	 * Get start of the current week
	 * @param weekStartsOn The index of the first day of the week (0 = Sunday, 1 = Monday, etc.)
	 */
	getWeekStart: (weekStartsOn: number = 0, day: Date = new Date()) => {
		const weekDay = day.getDay();
		// Calculate days to subtract to get to the start of the week
		const diff = (weekDay < weekStartsOn ? 7 : 0) + weekDay - weekStartsOn;
		return startOfDay(addDays(day, -diff));
	},

	/**
	 * Get end of the current week
	 * @param weekStartsOn The index of the first day of the week (0 = Sunday, 1 = Monday, etc.)
	 */
	getWeekEnd: (weekStartsOn: number = 0, day: Date = new Date()) => {
		const weekStart = dateUtils.getWeekStart(weekStartsOn, day);
		return endOfDay(addDays(weekStart, 6));
	},

	/**
	 * Check if a date is within the current week
	 * @param weekStartsOn The index of the first day of the week (0 = Sunday, 1 = Monday, etc.)
	 */
	isDateInCurrentWeek: (date: Date | string, weekStartsOn: number = 0) => {
		const parsedDate = typeof date === 'string' ? new Date(date) : date;
		const weekStart = dateUtils.getWeekStart(weekStartsOn);
		const weekEnd = dateUtils.getWeekEnd(weekStartsOn);

		return isWithinInterval(parsedDate, {
			start: weekStart,
			end: weekEnd
		});
	},

	/**
	 * Check if a date is within a given week (based on a reference date)
	 * @param weekStartsOn The index of the first day of the week (0 = Sunday, 1 = Monday, etc.)
	 */
	isDateInGivenWeek: (
		date: Date | string,
		referenceDate: Date | string,
		weekStartsOn: number = 0
	) => {
		const parsedDate = typeof date === 'string' ? new Date(date) : date;
		const parsedReference =
			typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
		const day = parsedReference.getDay();
		// Calculate days to subtract to get to the start of the week
		const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
		const weekStart = startOfDay(addDays(parsedReference, -diff));
		const weekEnd = endOfDay(addDays(weekStart, 6));

		return isWithinInterval(parsedDate, {
			start: weekStart,
			end: weekEnd
		});
	},

	// MONTHS

	/**
	 * Get start of the current month
	 */
	getMonthStart: (day: Date = new Date()) => {
		return startOfDay(new Date(day.getFullYear(), day.getMonth(), 1));
	},

	/**
	 * Get end of the current month
	 */
	getMonthEnd: (day: Date = new Date()) => {
		if (!day) {
			day = new Date();
		}
		return endOfDay(new Date(day.getFullYear(), day.getMonth() + 1, 0));
	},

	/**
	 * Get number of days in current month
	 */
	getDaysInMonth: (day: Date = new Date()) => {
		return new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
	},

	/**
	 * Check if a date is within the current month
	 */
	isDateInCurrentMonth: (date: Date | string) => {
		const parsedDate = typeof date === 'string' ? new Date(date) : date;
		const monthStart = dateUtils.getMonthStart();
		const monthEnd = dateUtils.getMonthEnd();

		return isWithinInterval(parsedDate, {
			start: monthStart,
			end: monthEnd
		});
	},

	/**
	 * Check if a date is within a given month (based on a reference date)
	 */
	isDateInGivenMonth: (date: Date | string, referenceDate: Date | string) => {
		const parsedDate = typeof date === 'string' ? new Date(date) : date;
		const parsedReference =
			typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
		const monthStart = startOfDay(
			new Date(parsedReference.getFullYear(), parsedReference.getMonth(), 1)
		);
		const monthEnd = endOfDay(
			new Date(parsedReference.getFullYear(), parsedReference.getMonth() + 1, 0)
		);

		return isWithinInterval(parsedDate, {
			start: monthStart,
			end: monthEnd
		});
	},

	/**
	 * Check if date is in the previous month (useful for comparisons)
	 */
	isDateInPreviousMonth: (date: Date | string) => {
		const parsedDate = typeof date === 'string' ? new Date(date) : date;
		const prevMonth = new Date();
		prevMonth.setMonth(prevMonth.getMonth() - 1);
		return dateUtils.isDateInGivenMonth(parsedDate, prevMonth);
	},

	/**
	 * Get the number of days remaining in the current budget period (month)
	 */
	getDaysRemainingInMonth: () => {
		const day = new Date();
		const endOfMonth = dateUtils.getMonthEnd();
		return Math.ceil((endOfMonth.getTime() - day.getTime()) / (1000 * 3600 * 24));
	},

	/**
	 * Get the number of days elapsed in the current budget period (month)
	 */
	getDaysElapsedInMonth: () => {
		const day = new Date();
		const startOfMonth = dateUtils.getMonthStart();
		return Math.ceil((day.getTime() - startOfMonth.getTime()) / (1000 * 3600 * 24)) + 1;
	},

	// YEARS

	/**
	 * Get start of the current year
	 */
	getYearStart: () => {
		const day = new Date();
		return startOfDay(new Date(day.getFullYear(), 0, 1));
	},

	/**
	 * Get end of the current year
	 */
	getYearEnd: () => {
		const day = new Date();
		return endOfDay(new Date(day.getFullYear(), 11, 31));
	},

	/**
	 * Check if a date is within the current year
	 */
	isDateInCurrentYear: (date: Date | string) => {
		const parsedDate = typeof date === 'string' ? new Date(date) : date;
		const yearStart = dateUtils.getYearStart();
		const yearEnd = dateUtils.getYearEnd();

		return isWithinInterval(parsedDate, {
			start: yearStart,
			end: yearEnd
		});
	},

	/**
	 * Check if a date is within a given year (based on a reference date)
	 */
	isDateInGivenYear: (date: Date | string, referenceDate: Date | string) => {
		const parsedDate = typeof date === 'string' ? new Date(date) : date;
		const parsedReference =
			typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
		const yearStart = startOfDay(new Date(parsedReference.getFullYear(), 0, 1));
		const yearEnd = endOfDay(new Date(parsedReference.getFullYear(), 11, 31));

		return isWithinInterval(parsedDate, {
			start: yearStart,
			end: yearEnd
		});
	},

	/**
	 * Get the percentage of time passed in the current budget period
	 */
	getPeriodProgress: () => {
		const elapsed = dateUtils.getDaysElapsedInMonth();
		const total = dateUtils.getDaysInMonth();
		return (elapsed / total) * 100;
	},

	comparePeriods: (current: number, previous: number) => {
		if (previous === 0) return 100; // avoid division by zero
		return ((current - previous) / previous) * 100;
	},

	/**
	 * Format date for display
	 */
	formatDate: (date: Date | string, formatString = 'yyyy-MM-dd') => {
		return format(typeof date === 'string' ? new Date(date) : date, formatString);
	},

	/**
	 * Format date as month name (e.g., "January 2023")
	 */
	formatMonthYear: (date: Date | string) => {
		return dateUtils.formatDate(date, 'MMMM yyyy');
	},

	/**
	 * Format date as short month (e.g., "Jan")
	 */
	formatShortMonth: (date: Date | string) => {
		return dateUtils.formatDate(date, 'MMM');
	},

	/**
	 * Format date as day of week (e.g., "Monday")
	 */
	formatDayOfWeek: (date: Date | string) => {
		return dateUtils.formatDate(date, 'EEEE');
	},

	/**
	 * Get relative time description
	 */
	getRelativeTime: (date: Date | string) => {
		const parsedDate = typeof date === 'string' ? new Date(date) : date;
		const now = new Date();
		const diffInDays = Math.floor((now.getTime() - parsedDate.getTime()) / (1000 * 3600 * 24));

		if (diffInDays === 0) return 'Today';
		if (diffInDays === 1) return 'Yesterday';
		if (diffInDays < 7) return `${diffInDays} days ago`;

		return dateUtils.formatDate(parsedDate);
	},

	/**
	 * Calculate daily budget based on remaining days and remaining amount
	 */
	calculateDailyBudget: (remainingAmount: number) => {
		const daysRemaining = dateUtils.getDaysRemainingInMonth();
		return remainingAmount / daysRemaining;
	},

	/**
	 * Get all dates in a month (useful for generating calendar views)
	 */
	getDatesInMonth: () => {
		const daysInMonth = dateUtils.getDaysInMonth();
		const today = new Date();
		return Array.from(
			{ length: daysInMonth },
			(_, i) => new Date(today.getFullYear(), today.getMonth(), i + 1)
		);
	},

	/**
	 * Check if a date is in the future
	 */
	isFutureDate: (date: string | Date) => {
		const parsedDate = typeof date === 'string' ? new Date(date) : date;
		return parsedDate > new Date();
	},

	/**
	 * Check if a date is in the past
	 */
	isPastDate: (date: string | Date) => {
		const parsedDate = typeof date === 'string' ? new Date(date) : date;
		return parsedDate < new Date();
	},

	/**
	 * Validate transaction date based on status
	 * @param date The date string
	 * @param status The transaction status
	 * @returns { isValid: boolean, error?: string }
	 */
	validateTransactionDate: (date: string, status: string) => {
		const dateObj = new Date(date);
		if (isNaN(dateObj.getTime())) {
			return { isValid: false, error: 'Invalid date format' };
		}
		if (status === 'cleared' && dateObj > new Date()) {
			return { isValid: false, error: 'Cleared date cannot be in the future' };
		}
		return { isValid: true };
	},

	// TIMEZONE-SAFE UTILITIES
	// These functions ensure dates stored in UTC are correctly displayed and compared in local timezone

	/**
	 * Get the local date string (YYYY-MM-DD) from a UTC ISO string
	 * This is useful for comparing dates without timezone issues
	 * @param isoString - ISO date string (e.g., "2024-01-15T18:08:00.000Z")
	 * @returns Local date string (e.g., "2024-01-15")
	 */
	getLocalDateString: (isoString: string): string => {
		const date = new Date(isoString);
		// Use local date components to get the correct local date
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	},

	/**
	 * Check if a UTC ISO date string represents today in the user's local timezone
	 * @param isoString - ISO date string
	 * @returns true if the date is today in local timezone
	 */
	isToday: (isoString: string): boolean => {
		const date = new Date(isoString);
		const today = new Date();

		// Compare local date strings
		const dateStr = dateUtils.getLocalDateString(isoString);
		const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

		return dateStr === todayStr;
	},

	/**
	 * Check if a UTC ISO date string represents yesterday in the user's local timezone
	 * @param isoString - ISO date string
	 * @returns true if the date is yesterday in local timezone
	 */
	isYesterday: (isoString: string): boolean => {
		const date = new Date(isoString);
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);

		const dateStr = dateUtils.getLocalDateString(isoString);
		const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

		return dateStr === yesterdayStr;
	},

	/**
	 * Format a UTC ISO date string for display in local timezone
	 * Returns smart relative formatting (Today, Yesterday, weekday, or date)
	 * @param isoString - ISO date string
	 * @param options - Formatting options
	 * @returns Formatted date string
	 */
	formatDateForDisplay: (
		isoString: string,
		options?: {
			showTime?: boolean;
			showYear?: boolean;
		}
	): string => {
		const date = new Date(isoString);
		const { showTime = false, showYear = false } = options || {};

		// Check if today
		if (dateUtils.isToday(isoString)) {
			if (showTime) {
				return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			}
			return 'Today';
		}

		// Check if yesterday
		if (dateUtils.isYesterday(isoString)) {
			return 'Yesterday';
		}

		// Check if within 7 days - show weekday
		const now = new Date();
		const diffTime = Math.abs(date.getTime() - now.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays <= 7) {
			return date.toLocaleDateString([], { weekday: 'short' });
		}

		// Otherwise show date
		const formatOptions: Intl.DateTimeFormatOptions = {
			month: 'short',
			day: 'numeric'
		};

		if (showYear || date.getFullYear() !== now.getFullYear()) {
			formatOptions.year = 'numeric';
		}

		return date.toLocaleDateString([], formatOptions);
	},

	/**
	 * Format a UTC ISO date string as a full date in local timezone
	 * @param isoString - ISO date string
	 * @param includeTime - Whether to include time
	 * @returns Formatted date string
	 */
	formatFullDate: (isoString: string, includeTime: boolean = false): string => {
		const date = new Date(isoString);
		const options: Intl.DateTimeFormatOptions = {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		};

		if (includeTime) {
			options.hour = '2-digit';
			options.minute = '2-digit';
		}

		return date.toLocaleDateString([], options);
	},

	/**
	 * Convert UTC ISO string to datetime-local input format (YYYY-MM-DDTHH:MM)
	 * This is needed because datetime-local inputs expect local time, not UTC
	 * @param isoString - UTC ISO date string
	 * @returns Local datetime string in format YYYY-MM-DDTHH:MM
	 */
	toLocalDateTimeInput: (isoString: string): string => {
		const date = new Date(isoString);
		// Get local date/time components
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	},

	/**
	 * Convert datetime-local input value (local time) to UTC ISO string
	 * datetime-local inputs return values in local timezone, so we need to convert to UTC
	 * @param localDateTimeString - Local datetime string in format YYYY-MM-DDTHH:MM
	 * @returns UTC ISO date string
	 */
	fromLocalDateTimeInput: (localDateTimeString: string): string => {
		if (!localDateTimeString) return '';
		// Create date from local datetime string (browser interprets as local time)
		const date = new Date(localDateTimeString);
		// Convert to UTC ISO string
		return date.toISOString();
	}
};
