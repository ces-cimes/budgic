import { writable } from 'svelte/store';

/** True while the transactions page is in bulk selection mode (hides global FAB). */
export const bulkSelectionActive = writable(false);
