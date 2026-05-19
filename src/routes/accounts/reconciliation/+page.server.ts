import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	// Prerender cannot emit paths with `?` on all platforms; in-app links use /data?tab=reconcile directly.
	throw redirect(302, '/data');
};
