// Replace stores with runes
let appErrors = $state<Array<{id: string; error: Error}>>([]);

export function reportError(error: Error) {
  appErrors = [...appErrors, {id: crypto.randomUUID(), error}];
}

// Export the reactive state
export { appErrors };