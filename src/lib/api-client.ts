import { getDeviceId } from '$lib/device-id';

export class ApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly code?: string,
		public readonly details?: unknown
	) {
		super(message);
		this.name = 'ApiError';
	}
}

/** Same-origin fetch for /api/* with device header and Basic Auth cookies. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set('X-Device-Id', getDeviceId());

	return fetch(input, {
		...init,
		credentials: 'include',
		headers
	});
}

export async function apiFetchJson<T>(input: string, init: RequestInit = {}): Promise<T> {
	const response = await apiFetch(input, init);
	if (!response.ok) {
		let code: string | undefined;
		let details: unknown;
		try {
			details = await response.json();
			code = (details as { error?: string })?.error;
		} catch {
			// ignore
		}
		throw new ApiError(
			code === 'device_not_allowed'
				? 'This device is not registered. Copy your Device ID from Settings and ask the admin to allow it.'
				: `Request failed (${response.status})`,
			response.status,
			code,
			details
		);
	}
	return response.json() as Promise<T>;
}
