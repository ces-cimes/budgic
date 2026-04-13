/**
 * Mobile input focus handling utilities
 *
 * Provides utilities for handling input focus on mobile devices,
 * ensuring inputs remain visible when the keyboard appears.
 */

/**
 * Creates a focus handler that scrolls input into view on mobile devices
 * Useful for preventing keyboard from covering input fields
 *
 * @returns A focus event handler function
 *
 * @example
 * ```typescript
 * const handleFocus = createMobileInputFocusHandler();
 * <input onfocus={handleFocus} />
 * ```
 */
export function createMobileInputFocusHandler(): (event: FocusEvent) => void {
	return (event: FocusEvent) => {
		const target = event.target as HTMLElement;
		if (target && 'scrollIntoView' in target) {
			// Small delay to ensure keyboard is shown
			setTimeout(() => {
				target.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
					inline: 'nearest'
				});
			}, 300);
		}
	};
}
