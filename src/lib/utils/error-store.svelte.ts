// Replace stores with runes
let appErrors = $state<Array<{id: string; error: Error}>>([]);

// Fallback UUID generation for older browsers
function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function reportError(error: Error) {
  appErrors = [...appErrors, {id: generateUUID(), error}];
}

// Export the reactive state
export { appErrors };