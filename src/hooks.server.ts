import type { Handle } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { isDeviceAllowed, isValidDeviceId } from '$lib/server/device-auth';

const API_PREFIX = '/api/';

/** Public API routes that skip device allowlist (none by default). */
const DEVICE_AUTH_EXEMPT = new Set<string>(['/api/health']);

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (pathname.startsWith(API_PREFIX) && !DEVICE_AUTH_EXEMPT.has(pathname)) {
		const deviceId = event.request.headers.get('x-device-id');

		if (!isValidDeviceId(deviceId)) {
			return json({ error: 'device_not_allowed', message: 'Missing or invalid X-Device-Id' }, { status: 401 });
		}

		if (!isDeviceAllowed(deviceId)) {
			return json({ error: 'device_not_allowed', message: 'Device not in allowlist' }, { status: 401 });
		}

		event.locals.deviceId = deviceId;
	}

	return resolve(event);
};
