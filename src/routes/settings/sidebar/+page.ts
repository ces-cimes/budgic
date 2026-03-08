import { redirect } from '@sveltejs/kit';

/** Sidebar settings merged into Settings > Navigation. Redirect old links. */
export function load() {
	redirect(302, '/settings/navigation');
}
