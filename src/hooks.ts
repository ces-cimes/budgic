import { deLocalizeUrl } from '$lib/paraglide/runtime';

export const reroute = (request: { url: string }) => deLocalizeUrl(request.url).pathname;

// Export empty transport object to satisfy SvelteKit's expectations
export const transport = {};
