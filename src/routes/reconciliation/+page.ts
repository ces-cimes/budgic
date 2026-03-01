import { redirect } from '@sveltejs/kit';

/** Redirect legacy /reconciliation to /accounts/reconciliation (hierarchy under Accounts). Preserves query params (e.g. ?account=id). */
export function load({ url }) {
	return redirect(302, `/accounts/reconciliation${url.search || ''}`);
}
