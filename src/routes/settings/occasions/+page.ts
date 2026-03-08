import { redirect } from '@sveltejs/kit';

/** Occasions settings merged into Settings > Plan. Redirect old links. */
export function load() {
	redirect(302, '/settings/plan#occasions');
}
