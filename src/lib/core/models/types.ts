import { z } from 'zod';

// Base Schema
export const BaseEntitySchema = z.object({
    id: z.string(),
    createdAt: z.string().datetime().default(() => new Date().toISOString()),
    updatedAt: z.string().datetime().default(() => new Date().toISOString()),
    isDeleted: z.boolean().default(false)
});

// Currency Schema
export const CurrencySchema = z.object({
    code: z.string().min(3).max(3),
    symbol: z.string().max(3),
    symbolPosition: z.enum(['prefix', 'suffix']).default('prefix'),
    decimalDigits: z.number().min(0).max(4).default(2)
});

// Simplified Account Schema
export const AccountSchema = BaseEntitySchema.extend({
    name: z.string().min(1),
    type: z.enum(['checking', 'savings', 'credit', 'cash', 'investment']), // Expanded types
    currency: z.string().min(3).max(3),
    isBudgetAccount: z.boolean().default(true) // Whether included in budget calculations
});

// Unified Category Schema
export const CategorySchema = BaseEntitySchema.extend({
    name: z.string().min(1),
    type: z.enum(['expense', 'income']), // Removed 'saving'
    parentId: z.string().optional(),
    isSystem: z.boolean().default(false) // For transfers/reconciliations
});

// Enhanced Transaction Schema
export const TransactionType = z.enum(['payment', 'transfer', 'adjustment']);
export const TransactionStatus = z.enum(['pending', 'cleared', 'cancelled']);

export const TransactionSchema = BaseEntitySchema.extend({
    type: TransactionType,
    status: TransactionStatus,
    currency: z.string().min(3).max(3),
    
    // Planning fields
    pendingAmount: z.number().nonnegative().optional(),
    pendingDate: z.string().datetime().optional(),
    
    // Cleared fields
    clearedAmount: z.number().nonnegative().optional(),
    clearedDate: z.string().datetime().optional(),
    
    // Payment fields
    accountId: z.string(),
    categoryId: z.string().optional(),
    
    // Transfer fields
    toAccountId: z.string().optional(),
    
    // Recurrence
    recurrenceRule: z.string().optional(),
    
    description: z.string().optional(),
    reference: z.string().optional()
}).superRefine((val, ctx) => {
    // Type-specific validations
    if (val.type === 'payment' && !val.categoryId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Payments require a category",
            path: ['categoryId']
        });
    }
    
    if (val.type === 'transfer' && !val.toAccountId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Transfers require a destination account",
            path: ['toAccountId']
        });
    }
    
    // Status-specific validations
    if (val.status === 'pending') {
        if (val.pendingAmount === undefined || val.pendingAmount <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Pending transactions require a positive pendingAmount",
                path: ['pendingAmount']
            });
        }
        if (!val.pendingDate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Pending transactions require a pendingDate",
                path: ['pendingDate']
            });
        }
    }
    
    if (val.status === 'cleared') {
        if (val.clearedAmount === undefined || val.clearedAmount <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Cleared transactions require a positive clearedAmount",
                path: ['clearedAmount']
            });
        }
        if (!val.clearedDate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Cleared transactions require a clearedDate",
                path: ['clearedDate']
            });
        }
        
        // If pending fields are provided for cleared transaction
        if (val.pendingAmount !== undefined && !val.pendingDate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "pendingDate is required when pendingAmount is provided",
                path: ['pendingDate']
            });
        }
    }
    
    // Recurrence validation (could be expanded)
    if (val.recurrenceRule && val.status !== 'pending') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Recurring transactions must be pending",
            path: ['status']
        });
    }
});

// Settings Schema
// TODO: expand upon
export const SettingsSchema = BaseEntitySchema.extend({
    currency: z.string().min(3).max(3).default('USD'),
    theme: z.enum(['light', 'dark']).default('dark'),
    language: z.enum(['en', 'ru']).default('en'),
    notificationsEnabled: z.boolean().default(true),
    firstDayOfWeek: z.number().min(0).max(6).default(0),


});

// Type Definitions
export type UUID = string;
export type BaseEntity = z.infer<typeof BaseEntitySchema> & { id: UUID };
export type Currency = z.infer<typeof CurrencySchema>;
export type Account = z.infer<typeof AccountSchema> & { id: UUID };
export type Category = z.infer<typeof CategorySchema> & { id: UUID };
export type Transaction = z.infer<typeof TransactionSchema> & { id: UUID };
export type Settings = z.infer<typeof SettingsSchema> & { id: UUID };
export type BalancesByType = {
    income: number;
    savings: number;
    expenses: number;
};

// ========================
// HELPER FUNCTIONS
// ========================

export function createTransaction(data: {
    // Common fields
    type: 'payment' | 'transfer' | 'adjustment';
    accountId: string;
    currency?: string;
    description?: string;
    reference?: string;
    
    // Status-specific fields
    status: 'pending' | 'cleared' | 'cancelled';
    pendingAmount?: number;
    pendingDate?: string;
    clearedAmount?: number;
    clearedDate?: string;
    
    // Payment fields
    categoryId?: string;
    
    // Transfer fields
    toAccountId?: string;
    
    // Recurrence
    recurrenceRule?: string;
}): Transaction {
    const now = new Date().toISOString();
    const currency = data.currency || 'USD';
    
    // Prepare the base transaction object
    const transaction: any = {
        id: crypto.randomUUID() as UUID,
        createdAt: now,
        updatedAt: now,
        currency,
        ...data
    };
    
    // Handle status-specific fields
    if (data.status === 'pending') {
        transaction.clearedAmount = 0;
        transaction.clearedDate = undefined;
        
        if (!data.pendingAmount || data.pendingAmount <= 0) {
            throw new Error("Pending transactions require a positive pendingAmount");
        }
        if (!data.pendingDate) {
            throw new Error("Pending transactions require a pendingDate");
        }
    }
    
    if (data.status === 'cleared') {
        if (!data.clearedAmount || data.clearedAmount <= 0) {
            throw new Error("Cleared transactions require a positive clearedAmount");
        }
        if (!data.clearedDate) {
            throw new Error("Cleared transactions require a clearedDate");
        }
        
        // Calculate variance if pendingAmount exists
        if (data.pendingAmount) {
            if (!data.pendingDate) {
                throw new Error("pendingDate is required when pendingAmount is provided");
            }
            transaction.variance = data.clearedAmount - data.pendingAmount;
        } else {
            transaction.pendingAmount = undefined;
            transaction.pendingDate = undefined;
        }
    }
    
    // Type-specific validations
    if (transaction.type === 'payment' && !transaction.categoryId) {
        throw new Error("Payments require a category");
    }
    
    if (transaction.type === 'transfer' && !transaction.toAccountId) {
        throw new Error("Transfers require a destination account");
    }
    
    // Recurrence validation
    if (transaction.recurrenceRule && transaction.status !== 'pending') {
        throw new Error("Recurring transactions must be pending");
    }
    
    return TransactionSchema.parse(transaction) as Transaction;
}

// Account Creator
export function createAccount(data: Partial<Account>): Account {
    const now = new Date().toISOString();
    return AccountSchema.parse({
        id: crypto.randomUUID() as UUID,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        currency: 'USD',
        ...data
    }) as Account;
}

export function createCategory(data: Partial<Category>): Category {
    const now = new Date().toISOString();
    return CategorySchema.parse({
        id: crypto.randomUUID() as UUID,
        createdAt: now,
        updatedNow: now,
        isDeleted: false,
        ...data
    }) as Category
}

// ========================
// VALIDATION FUNCTIONS
// ========================

export function validateTransactionsSchema(data: unknown) {
    if (!Array.isArray(data)) return validateTransaction(data);

    return validateTransactionArray(data);
}

export function validateAccount(data: unknown): data is Account {
    return AccountSchema.safeParse(data).success;
}

export function validateCategory(data: unknown): data is Category {
    return CategorySchema.safeParse(data).success;
}

export function validateTransaction(data: unknown): data is Transaction {
    const result = TransactionSchema.safeParse(data);
    if (!result.success) console.debug('Validation failed:', result.error);
    return result.success;
}

export function validateTransactionArray(data: unknown): data is Transaction[] {
    console.debug('[Types] Validating transaction array:', data);
    return Array.isArray(data) && data.every(validateTransaction);
}

export function validateAccountArray(data: unknown): data is Account[] {
    return Array.isArray(data) && data.every(validateAccount);
}

export function validateCategoryArray(data: unknown): data is Category[] {
    return Array.isArray(data) && data.every(validateCategory);
}