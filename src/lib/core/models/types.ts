import { z } from 'zod';

// Base schemas
export const BaseEntitySchema = z.object({
    id: z.string().uuid(),
    createdAt: z.string().datetime().default(() => new Date().toISOString()),
    updatedAt: z.string().datetime().default(() => new Date().toISOString())
});

// Account Schema
export const AccountSchema = BaseEntitySchema.extend({
    name: z.string().min(1, "Account name is required"),
    type: z.enum(['debit', 'credit', 'savings', 'investment']),
    category: z.string().optional(),  // Removed currentBalance
});

// Transaction Schema
export const TransactionSchema = BaseEntitySchema.extend({
    type: z.enum(['expense', 'income', 'saving']),
    accountId: z.string().uuid(),
    category: z.string().min(1, "Category is required"),
    plannedAmount: z.number().nonnegative().optional(),
    actualAmount: z.number().nonnegative().optional(),
    date: z.string().datetime(),
    description: z.string().optional(),
    isCompleted: z.boolean().default(false)
});

// Type Definitions with branded types for additional type safety
export type UUID = string & { readonly __brand: 'uuid' };

export type Account = z.infer<typeof AccountSchema> & { id: UUID };
export type Transaction = z.infer<typeof TransactionSchema> & { id: UUID };

export type BalancesByType = {
    income: number;
    savings: number;
    expenses: number;
};

// Creation helpers with validation
export function createAccount(data: Partial<Account> = {}): Account {
    const now = new Date().toISOString();
    return AccountSchema.parse({
        id: crypto.randomUUID(),
        name: 'New Account',
        type: 'debit',
        currentBalance: 0,
        createdAt: now,
        updatedAt: now,
        ...data
    }) as Account;
}

export function createTransaction(data: Partial<Transaction> & { accountId: string }): Transaction {
    const now = new Date().toISOString();
    return TransactionSchema.parse({
        id: crypto.randomUUID(),
        type: 'expense',
        category: 'Uncategorized',
        plannedAmount: 0,
        date: now,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        ...data
    }) as Transaction;
}

// Validation functions
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