import { z } from 'zod';

// Zod schemas for validation
const AccountSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    type: z.enum(['debit', 'credit', 'savings', 'investment']),
    currentBalance: z.number(),
    category: z.string().optional()
});

const TransactionSchema = z.object({
    id: z.string().uuid(),
    type: z.enum(['expense', 'income', 'saving']),
    accountId: z.string().uuid(),
    category: z.string().min(1),
    plannedAmount: z.number(),
    actualAmount: z.number().optional(),
    date: z.string().datetime(),
    description: z.string().optional(),
    isCompleted: z.boolean()
});

// Types inferred from schemas
export type Account = z.infer<typeof AccountSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;

// Helper functions with proper validation
export function createAccount(account: Partial<Account> = {}): Account {
    const result = AccountSchema.parse({
        id: crypto.randomUUID(),
        name: 'New Account',
        type: 'debit',
        currentBalance: 0,
        ...account
    });
    return result;
}

export function createTransaction(
    transaction: Partial<Transaction> & { accountId: string } // Require accountId
): Transaction {
    const result = TransactionSchema.parse({
        id: crypto.randomUUID(),
        type: 'expense',
        category: 'Uncategorized',
        plannedAmount: 0,
        date: new Date().toISOString(),
        isCompleted: false,
        ...transaction
    });
    return result;
}