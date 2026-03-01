import { redirect } from '@sveltejs/kit';

/** Redirect legacy /optimization to /insights?tab=optimize (UX/UI architecture) */
export function load() {
	return redirect(302, '/insights?tab=optimize');
}
