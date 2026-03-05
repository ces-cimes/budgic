/**
 * Global state for the Alerts panel (bell). Opens from header bell (mobile) or sidebar Alerts (desktop).
 */
let open = $state(false);

export const alertsPanelStore = {
	get open() {
		return open;
	},
	set open(value: boolean) {
		open = value;
	},
	openPanel() {
		open = true;
	},
	closePanel() {
		open = false;
	}
};
