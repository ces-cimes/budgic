import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, url }) => {
	return {
		url: url.pathname
	};
};
