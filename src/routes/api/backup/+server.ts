import { json } from '@sveltejs/kit';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getBackupDir } from '$lib/server/device-auth';
import type { RequestHandler } from './$types';

const MAX_BYTES = Number(process.env.BODY_SIZE_LIMIT ?? 52_428_800);

export const POST: RequestHandler = async ({ request, locals }) => {
	const deviceId = locals.deviceId;
	if (!deviceId) {
		return json({ error: 'device_not_allowed' }, { status: 401 });
	}

	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > MAX_BYTES) {
		return json({ error: 'payload_too_large' }, { status: 413 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid_json' }, { status: 400 });
	}

	const dir = join(getBackupDir(), deviceId);
	await mkdir(dir, { recursive: true });

	const latestPath = join(dir, 'latest.json');
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const versionedPath = join(dir, `${timestamp}.json`);

	const serialized = JSON.stringify(body);
	await writeFile(latestPath, serialized, 'utf8');
	await writeFile(versionedPath, serialized, 'utf8');

	return json({
		ok: true,
		deviceId,
		exportDate: typeof body === 'object' && body && 'exportDate' in body ? body.exportDate : null,
		savedAt: new Date().toISOString()
	});
};
