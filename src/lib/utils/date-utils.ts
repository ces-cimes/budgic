import { 
    addDays, 
    startOfDay, 
    endOfDay, 
    isWithinInterval, 
    format 
} from 'date-fns';

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
        const parsedReference = typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
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
        if (!day) { day = new Date(); }
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
        const parsedReference = typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
        const monthStart = startOfDay(new Date(parsedReference.getFullYear(), parsedReference.getMonth(), 1));
        const monthEnd = endOfDay(new Date(parsedReference.getFullYear(), parsedReference.getMonth() + 1, 0));
        
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
        const parsedReference = typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
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
        return format(
            typeof date === 'string' ? new Date(date) : date, 
            formatString
        );
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
        const diffInDays = Math.floor(
            (now.getTime() - parsedDate.getTime()) / (1000 * 3600 * 24)
        );

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
        return Array.from({ length: daysInMonth }, (_, i) => 
            new Date(today.getFullYear(), today.getMonth(), i + 1)
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
}; 