import { json } from '@sveltejs/kit';
import { getBackupDirDiagnostics, readLatestBackupWithFallback } from '$lib/server/backup-read';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const deviceId = locals.deviceId;
	if (!deviceId) {
		return json({ error: 'device_not_allowed' }, { status: 401 });
	}

	try {
		const result = await readLatestBackupWithFallback(deviceId);
		if (!result) {
			const diagnostics = await getBackupDirDiagnostics();
			return json(
				{
					error: 'not_found',
					message:
						diagnostics.filesScanned > 0 &&
						diagnostics.maxAccounts === 0 &&
						diagnostics.maxTransactions === 0
							? 'Backups exist on disk but none contain accounts or transactions'
							: 'No backup files found',
					diagnostics
				},
				{ status: 404 }
			);
		}
		return json(result.data);
	} catch (err) {
		console.error('[backup] read failed:', err);
		return json({ error: 'read_failed' }, { status: 500 });
	}
};
