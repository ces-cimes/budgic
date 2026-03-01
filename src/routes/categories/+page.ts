import { redirect } from '@sveltejs/kit';

/** Redirect /categories to Plan > Categories tab (list is inlined there). Add and detail stay at /categories/add and /categories/[id]. */
export function load({ url }) {
	const query = url.search ? `&${url.search.slice(1)}` : '';
	return redirect(302, `/plan?tab=categories${query}`);
}
