import { redirect } from '@sveltejs/kit';

/** Occasions removed (Phase 8). Redirect old links to Plan settings. */
export function load() {
	redirect(302, '/settings/plan');
}
