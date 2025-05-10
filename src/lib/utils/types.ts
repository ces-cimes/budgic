import { z } from 'zod';

// Zod schemas for validation
const AccountSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    type: z.enum(['debit', 'credit', 'savings', 'investment']),
    currentBalance: z.number(),
    category: z.string().optional(),
    createdAt: z.string().datetime().default(new Date().toISOString()),
    updatedAt: z.string().datetime().default(new Date().toISOString())
});

const TransactionSchema = z.object({
    id: z.string().uuid(),
    type: z.enum(['expense', 'income', 'saving']),
    accountId: z.string().uuid(),
    category: z.string().min(1),
    plannedAmount: z.number().nonnegative().optional(),
    actualAmount: z.number().nonnegative().optional(),
    date: z.string().datetime(),
    description: z.string().optional(),
    isCompleted: z.boolean().default(false),
    createdAt: z.string().datetime().default(new Date().toISOString()),
    updatedAt: z.string().datetime().default(new Date().toISOString())
});

// Types inferred from schemas
export type Account = z.infer<typeof AccountSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;

// Helper functions with proper validation
export function createAccount(account: Partial<Account> = {}): Account {
    const now = new Date().toISOString();
    const result = AccountSchema.parse({
        id: crypto.randomUUID(),
        name: 'New Account',
        type: 'debit',
        currentBalance: 0,
        createdAt: now,
        updatedAt: now,
        ...account
    });
    return result;
}

export function createTransaction(
    transaction: Partial<Transaction> & { accountId: string }
): Transaction {
    const now = new Date().toISOString();
    const result = TransactionSchema.parse({
        id: crypto.randomUUID(),
        type: 'expense',
        category: 'Uncategorized',
        plannedAmount: 0,
        date: now,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        ...transaction
    });
    return result;
}

// Validation functions for persistent store
export function validateAccount(data: unknown): data is Account {
    return AccountSchema.safeParse(data).success;
}

export function validateTransaction(data: unknown): data is Transaction {
    return TransactionSchema.safeParse(data).success;
}

export function validateAccountArray(data: unknown): data is Account[] {
    return Array.isArray(data) && data.every(validateAccount);
}

export function validateTransactionArray(data: unknown): data is Transaction[] {
    return Array.isArray(data) && data.every(validateTransaction);
}