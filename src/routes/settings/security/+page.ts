import { redirect } from '@sveltejs/kit';

/** Security & privacy merged into Settings > Profile. Redirect old links. */
export function load() {
	redirect(302, '/settings/profile#privacy');
}
