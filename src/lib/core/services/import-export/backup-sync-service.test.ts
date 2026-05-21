import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUDGIC_BACKUP_VERSION, type BudgicBackupV2 } from './budgic-backup-service';

const mockApiFetchJson = vi.fn();
const mockApiFetch = vi.fn();
const mockExportFullBackup = vi.fn();
const mockImportFullBackup = vi.fn();
const mockIsLocalDatabaseEmpty = vi.fn();
const mockGetUserPreferences = vi.fn();

vi.mock('$lib/api-client', () => ({
	apiFetchJson: (...args: unknown[]) => mockApiFetchJson(...args),
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
	ApiError: class ApiError extends Error {
		constructor(
			message: string,
			public readonly status: number,
			public readonly code?: string
		) {
			super(message);
			this.name = 'ApiError';
		}
	}
}));

vi.mock('$lib/core/services/core/user-service', () => ({
	userService: {
		getUserPreferences: () => mockGetUserPreferences()
	}
}));

vi.mock('./budgic-backup-service', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./budgic-backup-service')>();
	return {
		...actual,
		exportFullBackup: () => mockExportFullBackup(),
		importFullBackup: (data: unknown) => mockImportFullBackup(data),
		isLocalDatabaseEmpty: () => mockIsLocalDatabaseEmpty()
	};
});

import {
	clearServerRestoreDeclined,
	hasDeclinedServerRestore,
	pushBackupToServer,
	reloadPageAfterRestoreIfNeeded,
	resetAutoRestorePromptState,
	resetBackupSyncStateForTests,
	restoreFromServerIfEmpty
} from './backup-sync-service';

function emptyV2Backup(): BudgicBackupV2 {
	return {
		version: BUDGIC_BACKUP_VERSION,
		exportDate: '2026-01-01T00:00:00.000Z',
		tables: {
			accounts: [],
			transactions: [],
			currencies: [],
			categories: [],
			goals: [],
			userPreferences: [],
			userActions: [],
			autocompleteUsage: [],
			tags: [],
			insights: [],
			currencyConfigurations: [],
			exchangeRates: [],
			badges: [],
			reconciliationRecords: [],
			reconciliationDiscrepancies: [],
			learningPatterns: [],
			userFeedback: [],
			optimizationPreferences: [],
			negativeAllowanceEvents: [],
			envelopeBorrowings: [],
			rolloverAdjustments: [],
			roundUpRules: [],
			merchantCategoryProfiles: [],
			recurringPatternsCache: [],
			dataCorrections: [],
			people: [],
			personMigrationBatches: []
		}
	};
}

function backupWithAccount(): BudgicBackupV2 {
	const base = emptyV2Backup();
	base.tables.accounts = [{ id: 'a1' }];
	return base;
}

describe('backup-sync-service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		sessionStorage.clear();
		resetBackupSyncStateForTests();
		mockIsLocalDatabaseEmpty.mockResolvedValue(true);
		mockGetUserPreferences.mockResolvedValue({ backupEnabled: true });
		Object.defineProperty(globalThis, 'navigator', {
			value: { onLine: true },
			configurable: true
		});
	});

	describe('restoreFromServerIfEmpty', () => {
		it('skips when user previously declined restore', async () => {
			localStorage.setItem('budgic_server_restore_declined', '1');
			const confirm = vi.fn(() => true);

			const restored = await restoreFromServerIfEmpty(confirm);

			expect(restored).toBe(false);
			expect(mockApiFetchJson).not.toHaveBeenCalled();
			expect(confirm).not.toHaveBeenCalled();
		});

		it('treats interrupted confirm (page reload during dialog) as declined', async () => {
			sessionStorage.setItem('budgic_restore_offer_in_progress', '1');
			const confirm = vi.fn(() => true);

			const restored = await restoreFromServerIfEmpty(confirm);

			expect(restored).toBe(false);
			expect(hasDeclinedServerRestore()).toBe(true);
			expect(confirm).not.toHaveBeenCalled();
		});

		it('runs restore only once per page lifetime', async () => {
			mockApiFetchJson.mockResolvedValue(backupWithAccount());
			const confirm = vi.fn(() => false);

			await restoreFromServerIfEmpty(confirm);
			await restoreFromServerIfEmpty(confirm);

			expect(confirm).toHaveBeenCalledTimes(1);
		});

		it('skips when server backup is disabled in preferences', async () => {
			mockGetUserPreferences.mockResolvedValue({ backupEnabled: false });
			const confirm = vi.fn(() => true);

			const restored = await restoreFromServerIfEmpty(confirm);

			expect(restored).toBe(false);
			expect(mockApiFetchJson).not.toHaveBeenCalled();
			expect(confirm).not.toHaveBeenCalled();
		});

		it('skips when local database is not empty', async () => {
			mockIsLocalDatabaseEmpty.mockResolvedValue(false);
			const confirm = vi.fn(() => true);

			const restored = await restoreFromServerIfEmpty(confirm);

			expect(restored).toBe(false);
			expect(mockApiFetchJson).not.toHaveBeenCalled();
			expect(confirm).not.toHaveBeenCalled();
		});

		it('skips when remote backup has no accounts or transactions', async () => {
			mockApiFetchJson.mockResolvedValue(emptyV2Backup());
			const confirm = vi.fn(() => true);

			const restored = await restoreFromServerIfEmpty(confirm);

			expect(restored).toBe(false);
			expect(confirm).not.toHaveBeenCalled();
		});

		it('records decline and does not import when user cancels', async () => {
			mockApiFetchJson.mockResolvedValue(backupWithAccount());
			const confirm = vi.fn(() => false);

			const restored = await restoreFromServerIfEmpty(confirm);

			expect(restored).toBe(false);
			expect(hasDeclinedServerRestore()).toBe(true);
			expect(mockImportFullBackup).not.toHaveBeenCalled();
			expect(sessionStorage.getItem('budgic_restore_offer_in_progress')).toBeNull();
		});

		it('imports and clears decline when user confirms and data persists', async () => {
			const remote = backupWithAccount();
			mockApiFetchJson.mockResolvedValue(remote);
			mockIsLocalDatabaseEmpty.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
			const confirm = vi.fn(() => true);

			const restored = await restoreFromServerIfEmpty(confirm);

			expect(restored).toBe(true);
			expect(mockImportFullBackup).toHaveBeenCalledWith(remote);
			expect(hasDeclinedServerRestore()).toBe(false);
		});

		it('does not report success when import leaves database empty', async () => {
			mockApiFetchJson.mockResolvedValue(backupWithAccount());
			mockIsLocalDatabaseEmpty.mockResolvedValue(true);
			const confirm = vi.fn(() => true);

			const restored = await restoreFromServerIfEmpty(confirm);

			expect(restored).toBe(false);
			expect(hasDeclinedServerRestore()).toBe(true);
		});
	});

	describe('pushBackupToServer', () => {
		it('does not push when local database is empty', async () => {
			mockIsLocalDatabaseEmpty.mockResolvedValue(true);

			await pushBackupToServer();

			expect(mockExportFullBackup).not.toHaveBeenCalled();
			expect(mockApiFetch).not.toHaveBeenCalled();
		});

		it('pushes when local database has user data', async () => {
			mockIsLocalDatabaseEmpty.mockResolvedValue(false);
			mockExportFullBackup.mockResolvedValue(emptyV2Backup());
			mockApiFetch.mockResolvedValue({ ok: true });

			await pushBackupToServer();

			expect(mockExportFullBackup).toHaveBeenCalled();
			expect(mockApiFetch).toHaveBeenCalled();
		});
	});

	describe('reloadPageAfterRestoreIfNeeded', () => {
		it('reloads only once per session', () => {
			const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});

			reloadPageAfterRestoreIfNeeded();
			reloadPageAfterRestoreIfNeeded();

			expect(reload).toHaveBeenCalledTimes(1);
			reload.mockRestore();
		});
	});

	describe('clearServerRestoreDeclined', () => {
		it('clears the decline flag', () => {
			localStorage.setItem('budgic_server_restore_declined', '1');
			clearServerRestoreDeclined();
			expect(hasDeclinedServerRestore()).toBe(false);
		});
	});

	describe('resetAutoRestorePromptState', () => {
		it('clears decline, session restore keys, and startup single-flight', async () => {
			localStorage.setItem('budgic_server_restore_declined', '1');
			sessionStorage.setItem('budgic_restore_offer_in_progress', '1');
			sessionStorage.setItem('budgic_post_restore_reload', '1');
			mockApiFetchJson.mockResolvedValue(backupWithAccount());
			const confirm = vi.fn(() => false);

			await restoreFromServerIfEmpty(confirm);
			expect(confirm).toHaveBeenCalledTimes(0);

			resetAutoRestorePromptState();
			expect(hasDeclinedServerRestore()).toBe(false);
			expect(sessionStorage.getItem('budgic_post_restore_reload')).toBeNull();

			await restoreFromServerIfEmpty(confirm);
			expect(confirm).toHaveBeenCalledTimes(1);
		});
	});
});
