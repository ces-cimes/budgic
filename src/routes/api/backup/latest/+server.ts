import { json } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getBackupDir } from '$lib/server/device-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const deviceId = locals.deviceId;
	if (!deviceId) {
		return json({ error: 'device_not_allowed' }, { status: 401 });
	}

	const latestPath = join(getBackupDir(), deviceId, 'latest.json');

	try {
		const raw = await readFile(latestPath, 'utf8');
		const data = JSON.parse(raw) as unknown;
		return json(data);
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code;
		if (code === 'ENOENT') {
			return json({ error: 'not_found' }, { status: 404 });
		}
		console.error('[backup] read failed:', err);
		return json({ error: 'read_failed' }, { status: 500 });
	}
};
