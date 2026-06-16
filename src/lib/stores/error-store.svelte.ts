// Error store — centralized error tracking
// Usage: import { reportError, appErrors } from '$lib/stores/error-store.svelte';

let appErrors = $state<Array<{ id: string; error: Error }>>([]);

function generateUUID(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

export function reportError(error: Error) {
	appErrors.push({ id: generateUUID(), error });
}

export function clearErrors() {
	appErrors.length = 0;
}

export function getErrors() {
	return appErrors;
}
