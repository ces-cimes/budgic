/**
 * Global state for the add-transaction type picker (FAB → picker → form).
 * Open from FAB; on selection, navigate to /transactions/add?type=&status=
 */
export const typePicker = $state({ open: false });

export function openTypePicker() {
	typePicker.open = true;
}

export function closeTypePicker() {
	typePicker.open = false;
}
