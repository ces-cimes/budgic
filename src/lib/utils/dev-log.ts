/**
 * Debug logging gated to development only.
 * Use instead of raw `console.log` / `console.warn` in services and UI.
 */
export function devLog(...args: unknown[]): void {
	if (import.meta.env.DEV) {
		console.log(...args);
	}
}

export function devWarn(...args: unknown[]): void {
	if (import.meta.env.DEV) {
		console.warn(...args);
	}
}
