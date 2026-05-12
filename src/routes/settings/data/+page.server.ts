import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Deprecated: Data / import UI lives at `/data`. Keep redirect for bookmarks. */
export const load: PageServerLoad = () => {
	throw redirect(302, '/data');
};
