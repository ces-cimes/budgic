import { redirect } from '@sveltejs/kit';

/** Redirect legacy /goals to /plan?tab=goals (UX/UI architecture) */
export function load() {
	return redirect(302, '/plan?tab=goals');
}
