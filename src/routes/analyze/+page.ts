import { redirect } from '@sveltejs/kit';

/** Legacy route: redirect to /reports (query params preserved). */
export function load({ url }) {
	const q = url.search ? url.search : '';
	return redirect(302, `/reports${q}`);
}
