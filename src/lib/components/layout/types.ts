import type { Transaction } from '$lib/core/db';

export interface ProcessedTransaction extends Transaction {
	tagNames?: {
		what?: string;
		why?: string;
		where?: string;
		custom?: string[];
	};
	tagColors?: {
		what?: string;
		why?: string;
		where?: string;
		custom?: Record<string, string>;
	};
	confidenceLevel?: 'confirmed' | 'likely' | 'maybe';
	isOverdue?: boolean;
	isRecurring?: boolean;
} 