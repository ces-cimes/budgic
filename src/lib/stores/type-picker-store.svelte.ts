/**
 * Global state for the add-transaction type picker (FAB → picker → form).
 * Open from FAB; on selection, navigate to /transactions/add?type=&status=
 */
import { writable } from 'svelte/store';

export const typePickerOpen = writable<boolean>(false);

export function openTypePicker() {
	typePickerOpen.set(true);
}

export function closeTypePicker() {
	typePickerOpen.set(false);
}
