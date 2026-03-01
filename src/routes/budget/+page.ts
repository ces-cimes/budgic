import { redirect } from '@sveltejs/kit';

/** Legacy route: redirect to Plan > Budget tab (query params appended). */
export function load({ url }) {
	const q = url.search ? `&${url.search.slice(1)}` : '';
	return redirect(302, `/plan?tab=budget${q}`);
}
