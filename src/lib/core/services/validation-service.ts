import { db, validateSplitTransaction, validateNewSplitTransaction, BalanceUtils } from '$lib/core/db';
import { isValidCurrencyCode, validateAmount, getCurrencyInfo, getDecimalPlaces } from '$lib/utils/currency-utils';
import { dateUtils } from '$lib/utils/date-utils';
import type { Transaction, Account, Currency, Tag, WhatTagType, WhyTagType } from '$lib/core/db';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
}

export interface CurrencyValidationResult {
    isValid: boolean;
    error?: string;
}

export interface AmountValidationResult {
    isValid: boolean;
    error?: string;
}

export interface DateValidationResult {
    isValid: boolean;
    error?: string;
}

export interface AccountValidationResult {
    isValid: boolean;
    error?: string | undefined;
    calculatedBalance?: number;
}

export interface SplitTransactionValidationResult {
    isValid: boolean;
    errors: string[];
    totalAmount: number;
}

export interface EntityValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
}

class ValidationService {
    public get ready() {
        return db.isOpen();
    }

    public isLoading() {
        return !this.ready;
    }

    // ============================================================================
    // CURRENCY VALIDATION
    // ============================================================================

    /**
     * Validate currency code format and availability
     */
    async validateCurrencyCode(code: string): Promise<CurrencyValidationResult> {
        // Check format
        if (!isValidCurrencyCode(code)) {
            return { isValid: false, error: 'Invalid currency code. Must be 3 uppercase letters (ISO 4217 format)' };
        }

        // Check if currency exists in database
        const currency = await db.getCurrencyByCode(code);
        if (!currency) {
            return { isValid: false, error: 'Currency not found' };
        }

        // Check if currency is active
        if (!currency.isActive) {
            return { isValid: false, error: 'Currency is inactive' };
        }

        return { isValid: true };
    }

    /**
     * Validate amount for a specific currency
     */
    validateAmount(amount: number, currencyCode: string): AmountValidationResult {
        return validateAmount(amount, currencyCode);
    }

    /**
     * Validate decimal places for a currency
     */
    validateDecimalPlaces(amount: number, currencyCode: string): AmountValidationResult {
        const currencyInfo = getCurrencyInfo(currencyCode);
        if (!currencyInfo) {
            return { isValid: false, error: 'Currency information not found' };
        }

        const decimalPlaces = getDecimalPlaces(amount);
        if (decimalPlaces > currencyInfo.decimalPlaces) {
            return { 
                isValid: false, 
                error: `${currencyInfo.name} supports maximum ${currencyInfo.decimalPlaces} decimal places` 
            };
        }

        return { isValid: true };
    }

    // ============================================================================
    // DATE VALIDATION
    // ============================================================================

    /**
     * Validate transaction dates based on status
     */
    validateTransactionDate(date: string, status: Transaction['status']): DateValidationResult {
        return dateUtils.validateTransactionDate(date, status);
    }

    /**
     * Validate date format
     */
    validateDateFormat(date: string): DateValidationResult {
        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) {
            return { isValid: false, error: 'Invalid date format' };
        }
        return { isValid: true };
    }

    /**
     * Check if date is in the future
     */
    isFutureDate(date: string): boolean {
        return dateUtils.isFutureDate(date);
    }

    /**
     * Check if date is in the past
     */
    isPastDate(date: string): boolean {
        return dateUtils.isPastDate(date);
    }

    // ============================================================================
    // ACCOUNT VALIDATION
    // ============================================================================

    /**
     * Validate account balance consistency
     */
    async validateAccountBalance(accountId: string): Promise<AccountValidationResult> {
        return await BalanceUtils.validateAccountBalance(accountId);
    }

    /**
     * Validate account data for creation
     */
    async validateAccountCreation(accountData: Partial<Account>): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!accountData.name?.trim()) {
            errors.push('Account name is required');
        }

        if (!accountData.type) {
            errors.push('Account type is required');
        }

        // Currency validation
        if (accountData.currency) {
            const currencyValidation = await this.validateCurrencyCode(accountData.currency);
            if (!currencyValidation.isValid) {
                errors.push(currencyValidation.error!);
            }
        }

        // Balance validation
        if (accountData.initialBalance !== undefined) {
            const amountValidation = this.validateAmount(accountData.initialBalance, accountData.currency || 'USD');
            if (!amountValidation.isValid) {
                errors.push(amountValidation.error!);
            }
        }

        // Check for duplicate account names
        if (accountData.name) {
            const existingAccounts = await db.accounts
                .filter(account => account.name.toLowerCase() === accountData.name!.toLowerCase())
                .filter(account => !account.deletedAt)
                .toArray();
            
            if (existingAccounts.length > 0) {
                warnings.push('An account with this name already exists');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate account data for updates
     */
    async validateAccountUpdate(accountId: string, updates: Partial<Account>): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if account exists
        const account = await db.accounts.get(accountId);
        if (!account) {
            errors.push('Account not found');
            return { isValid: false, errors };
        }

        // Currency validation
        if (updates.currency) {
            const currencyValidation = await this.validateCurrencyCode(updates.currency);
            if (!currencyValidation.isValid) {
                errors.push(currencyValidation.error!);
            }
        }

        // Balance validation
        if (updates.initialBalance !== undefined) {
            const amountValidation = this.validateAmount(updates.initialBalance, updates.currency || account.currency);
            if (!amountValidation.isValid) {
                errors.push(amountValidation.error!);
            }
        }

        // Check for duplicate account names
        if (updates.name && updates.name !== account.name) {
            const existingAccounts = await db.accounts
                .filter(acc => acc.name.toLowerCase() === updates.name!.toLowerCase())
                .filter(acc => acc.id !== accountId)
                .filter(acc => !acc.deletedAt)
                .toArray();
            
            if (existingAccounts.length > 0) {
                warnings.push('An account with this name already exists');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ============================================================================
    // TRANSACTION VALIDATION
    // ============================================================================

    /**
     * Validate transaction data for creation
     */
    async validateTransactionCreation(transactionData: Partial<Transaction>): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!transactionData.accountId) {
            errors.push('Account ID is required');
        }

        if (transactionData.amount === undefined || transactionData.amount === null) {
            errors.push('Amount is required');
        }

        if (!transactionData.type) {
            errors.push('Transaction type is required');
        }

        if (!transactionData.status) {
            errors.push('Transaction status is required');
        }

        // Account validation
        if (transactionData.accountId) {
            const account = await db.accounts.get(transactionData.accountId);
            if (!account) {
                errors.push('Account not found');
            } else if (account.deletedAt) {
                errors.push('Cannot create transaction for deleted account');
            }
        }

        // Amount validation
        if (transactionData.amount !== undefined && transactionData.amount !== null) {
            const currency = transactionData.currency || 'USD';
            const amountValidation = this.validateAmount(transactionData.amount, currency);
            if (!amountValidation.isValid) {
                errors.push(amountValidation.error!);
            }
        }

        // Date validation
        if (transactionData.status === 'cleared' && transactionData.clearedDate) {
            const dateValidation = this.validateTransactionDate(transactionData.clearedDate, transactionData.status);
            if (!dateValidation.isValid) {
                errors.push(dateValidation.error!);
            }
        }

        if (transactionData.status === 'planned' && transactionData.plannedDate) {
            const dateValidation = this.validateTransactionDate(transactionData.plannedDate, transactionData.status);
            if (!dateValidation.isValid) {
                errors.push(dateValidation.error!);
            }
        }

        // Currency validation
        if (transactionData.currency) {
            const currencyValidation = await this.validateCurrencyCode(transactionData.currency);
            if (!currencyValidation.isValid) {
                errors.push(currencyValidation.error!);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate transaction data for updates
     */
    async validateTransactionUpdate(transactionId: string, updates: Partial<Transaction>): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if transaction exists
        const transaction = await db.transactions.get(transactionId);
        if (!transaction) {
            errors.push('Transaction not found');
            return { isValid: false, errors };
        }

        // Account validation
        if (updates.accountId && updates.accountId !== transaction.accountId) {
            const account = await db.accounts.get(updates.accountId);
            if (!account) {
                errors.push('Account not found');
            } else if (account.deletedAt) {
                errors.push('Cannot move transaction to deleted account');
            }
        }

        // Amount validation
        if (updates.amount !== undefined && updates.amount !== null) {
            const currency = updates.currency || transaction.currency;
            const amountValidation = this.validateAmount(updates.amount, currency);
            if (!amountValidation.isValid) {
                errors.push(amountValidation.error!);
            }
        }

        // Date validation
        const status = updates.status || transaction.status;
        if (status === 'cleared' && updates.clearedDate) {
            const dateValidation = this.validateTransactionDate(updates.clearedDate, status);
            if (!dateValidation.isValid) {
                errors.push(dateValidation.error!);
            }
        }

        if (status === 'planned' && updates.plannedDate) {
            const dateValidation = this.validateTransactionDate(updates.plannedDate, status);
            if (!dateValidation.isValid) {
                errors.push(dateValidation.error!);
            }
        }

        // Currency validation
        if (updates.currency) {
            const currencyValidation = await this.validateCurrencyCode(updates.currency);
            if (!currencyValidation.isValid) {
                errors.push(currencyValidation.error!);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ============================================================================
    // SPLIT TRANSACTION VALIDATION
    // ============================================================================

    /**
     * Validate split transaction group for creation
     */
    validateSplitTransactionCreation(splitTransactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[]): SplitTransactionValidationResult {
        return validateNewSplitTransaction(splitTransactions);
    }

    /**
     * Validate split transaction group for updates
     */
    validateSplitTransactionUpdate(splitTransactions: Transaction[]): SplitTransactionValidationResult {
        return validateSplitTransaction(splitTransactions);
    }

    /**
     * Validate split sum consistency
     */
    validateSplitSum(splitTransactions: Transaction[]): SplitTransactionValidationResult {
        return BalanceUtils.validateSplitSum(splitTransactions);
    }

    // ============================================================================
    // TAG VALIDATION
    // ============================================================================

    /**
     * Validate tag data for creation
     */
    async validateTagCreation(tagData: Partial<Tag>): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!tagData.name?.trim()) {
            errors.push('Tag name is required');
        }

        if (!tagData.dimension?.trim()) {
            errors.push('Tag dimension is required');
        }

        // Check for duplicate tag names in the same dimension
        if (tagData.name && tagData.dimension) {
            const existingTag = await db.tags
                .where('name').equals(tagData.name)
                .and(tag => tag.dimension === tagData.dimension)
                .filter(tag => !tag.deletedAt)
                .first();
            
            if (existingTag) {
                warnings.push('A tag with this name already exists in this dimension');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate tag data for updates
     */
    async validateTagUpdate(tagId: string, updates: Partial<Tag>): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if tag exists
        const tag = await db.tags.get(tagId);
        if (!tag) {
            errors.push('Tag not found');
            return { isValid: false, errors };
        }

        // Check for duplicate tag names in the same dimension
        if (updates.name && updates.name !== tag.name) {
            const existingTag = await db.tags
                .where('name').equals(updates.name)
                .and(t => t.dimension === (updates.dimension || tag.dimension))
                .filter(t => t.id !== tagId)
                .filter(t => !t.deletedAt)
                .first();
            
            if (existingTag) {
                warnings.push('A tag with this name already exists in this dimension');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ============================================================================
    // CURRENCY VALIDATION (FOR CURRENCY SERVICE)
    // ============================================================================

    /**
     * Validate currency data for creation
     */
    async validateCurrencyCreation(currencyData: Partial<Currency>): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!currencyData.code?.trim()) {
            errors.push('Currency code is required');
        }

        if (!currencyData.name?.trim()) {
            errors.push('Currency name is required');
        }

        if (!currencyData.symbol?.trim()) {
            errors.push('Currency symbol is required');
        }

        // Code format validation
        if (currencyData.code) {
            if (!isValidCurrencyCode(currencyData.code)) {
                errors.push('Invalid currency code. Must be 3 uppercase letters (ISO 4217 format)');
            }
        }

        // Check for duplicate currency codes
        if (currencyData.code) {
            const existingCurrency = await db.getCurrencyByCode(currencyData.code);
            if (existingCurrency) {
                errors.push(`Currency with code ${currencyData.code} already exists`);
            }
        }

        // Decimal places validation
        if (currencyData.decimalPlaces !== undefined) {
            if (currencyData.decimalPlaces < 0 || currencyData.decimalPlaces > 18) {
                errors.push('Decimal places must be between 0 and 18');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate currency data for updates
     */
    async validateCurrencyUpdate(currencyId: string, updates: Partial<Currency>): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if currency exists
        const currency = await db.currencies.get(currencyId);
        if (!currency) {
            errors.push('Currency not found');
            return { isValid: false, errors };
        }

        // Prevent updating system currencies
        if (currency.isSystem && (updates.code || updates.name || updates.symbol || updates.decimalPlaces)) {
            errors.push('Cannot modify system currencies');
        }

        // Code format validation
        if (updates.code) {
            if (!isValidCurrencyCode(updates.code)) {
                errors.push('Invalid currency code. Must be 3 uppercase letters (ISO 4217 format)');
            }
        }

        // Check for code conflicts
        if (updates.code && updates.code !== currency.code) {
            const existingCurrency = await db.getCurrencyByCode(updates.code);
            if (existingCurrency) {
                errors.push(`Currency with code ${updates.code} already exists`);
            }
        }

        // Decimal places validation
        if (updates.decimalPlaces !== undefined) {
            if (updates.decimalPlaces < 0 || updates.decimalPlaces > 18) {
                errors.push('Decimal places must be between 0 and 18');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate currency deletion
     */
    async validateCurrencyDeletion(currencyId: string): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if currency exists
        const currency = await db.currencies.get(currencyId);
        if (!currency) {
            errors.push('Currency not found');
            return { isValid: false, errors };
        }

        // Prevent deleting system currencies
        if (currency.isSystem) {
            errors.push('Cannot delete system currencies');
        }

        // Check if currency is in use by accounts
        const accountsUsingCurrency = await db.accounts
            .filter(account => account.currency === currency.code && !account.deletedAt)
            .toArray();

        if (accountsUsingCurrency.length > 0) {
            errors.push(`Cannot delete currency ${currency.code} - it is used by ${accountsUsingCurrency.length} account(s)`);
        }

        // Check if currency is in use by transactions
        const transactionsUsingCurrency = await db.transactions
            .filter(transaction => transaction.currency === currency.code && !transaction.deletedAt)
            .toArray();

        if (transactionsUsingCurrency.length > 0) {
            errors.push(`Cannot delete currency ${currency.code} - it is used by ${transactionsUsingCurrency.length} transaction(s)`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ============================================================================
    // BUDGET VALIDATION
    // ============================================================================

    /**
     * Validate tag budget creation
     */
    async validateTagBudgetCreation(budgetData: {
        tagName: string;
        waterfallCategory: 'survival' | 'security' | 'growth' | 'lifestyle';
        allocatedAmount: number;
        priority?: number;
        isGoalBased?: boolean;
        goalType?: 'monthly' | 'target' | 'recurring';
        goalTarget?: number;
    }): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!budgetData.tagName?.trim()) {
            errors.push('Tag name is required');
        }

        if (!budgetData.waterfallCategory) {
            errors.push('Waterfall category is required');
        }

        if (budgetData.allocatedAmount === undefined || budgetData.allocatedAmount === null) {
            errors.push('Allocated amount is required');
        }

        // Category validation
        const validCategories = ['survival', 'security', 'growth', 'lifestyle'];
        if (budgetData.waterfallCategory && !validCategories.includes(budgetData.waterfallCategory)) {
            errors.push(`Invalid waterfall category. Must be one of: ${validCategories.join(', ')}`);
        }

        // Amount validation
        if (budgetData.allocatedAmount !== undefined && budgetData.allocatedAmount < 0) {
            errors.push('Allocated amount cannot be negative');
        }

        // Priority validation
        if (budgetData.priority !== undefined) {
            if (budgetData.priority < 1 || budgetData.priority > 100) {
                errors.push('Priority must be between 1 and 100');
            }
        }

        // Goal validation
        if (budgetData.isGoalBased) {
            if (!budgetData.goalType) {
                errors.push('Goal type is required when creating a goal-based budget');
            }

            const validGoalTypes = ['monthly', 'target', 'recurring'];
            if (budgetData.goalType && !validGoalTypes.includes(budgetData.goalType)) {
                errors.push(`Invalid goal type. Must be one of: ${validGoalTypes.join(', ')}`);
            }

            if (budgetData.goalType === 'target' && budgetData.goalTarget === undefined) {
                errors.push('Goal target is required for target-based goals');
            }

            if (budgetData.goalTarget !== undefined && budgetData.goalTarget <= 0) {
                errors.push('Goal target must be greater than 0');
            }
        }

        // Check for duplicate tag budgets
        if (budgetData.tagName) {
            const existingTag = await db.tags
                .filter(tag => tag.name.toLowerCase() === budgetData.tagName!.toLowerCase())
                .filter(tag => !tag.deletedAt)
                .first();
            
            if (existingTag) {
                warnings.push('A tag with this name already exists');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate tag budget updates
     */
    async validateTagBudgetUpdate(tagId: string, updates: {
        allocatedAmount?: number;
        priority?: number;
        isGoalBased?: boolean;
        goalType?: 'monthly' | 'target' | 'recurring';
        goalTarget?: number;
    }): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if tag exists
        const tag = await db.tags.get(tagId);
        if (!tag) {
            errors.push('Tag not found');
            return { isValid: false, errors };
        }

        // Amount validation
        if (updates.allocatedAmount !== undefined && updates.allocatedAmount < 0) {
            errors.push('Allocated amount cannot be negative');
        }

        // Priority validation
        if (updates.priority !== undefined) {
            if (updates.priority < 1 || updates.priority > 100) {
                errors.push('Priority must be between 1 and 100');
            }
        }

        // Goal validation
        if (updates.isGoalBased !== undefined) {
            if (updates.isGoalBased && !updates.goalType) {
                errors.push('Goal type is required when creating a goal-based budget');
            }

            const validGoalTypes = ['monthly', 'target', 'recurring'];
            if (updates.goalType && !validGoalTypes.includes(updates.goalType)) {
                errors.push(`Invalid goal type. Must be one of: ${validGoalTypes.join(', ')}`);
            }

            if (updates.goalType === 'target' && updates.goalTarget === undefined) {
                errors.push('Goal target is required for target-based goals');
            }

            if (updates.goalTarget !== undefined && updates.goalTarget <= 0) {
                errors.push('Goal target must be greater than 0');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate why tag creation
     */
    async validateWhyTagCreation(tagData: {
        name: string;
        waterfallCategory: 'survival' | 'security' | 'growth' | 'lifestyle';
    }): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!tagData.name?.trim()) {
            errors.push('Tag name is required');
        }

        if (!tagData.waterfallCategory) {
            errors.push('Waterfall category is required');
        }

        // Category validation
        const validCategories = ['survival', 'security', 'growth', 'lifestyle'];
        if (tagData.waterfallCategory && !validCategories.includes(tagData.waterfallCategory)) {
            errors.push(`Invalid waterfall category. Must be one of: ${validCategories.join(', ')}`);
        }

        // Check for duplicate why tags
        if (tagData.name) {
            const existingTag = await db.tags
                .filter(tag => tag.name.toLowerCase() === tagData.name!.toLowerCase())
                .filter(tag => tag.dimension === 'why' && !tag.deletedAt)
                .first();
            
            if (existingTag) {
                errors.push('A why tag with this name already exists');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate why tag category update
     */
    async validateWhyTagCategoryUpdate(tagId: string, waterfallCategory: 'survival' | 'security' | 'growth' | 'lifestyle'): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if tag exists
        const tag = await db.tags.get(tagId);
        if (!tag) {
            errors.push('Tag not found');
            return { isValid: false, errors };
        }

        // Check if it's a why tag
        if (tag.dimension !== 'why') {
            errors.push('Can only update waterfall category for why tags');
        }

        // Category validation
        const validCategories = ['survival', 'security', 'growth', 'lifestyle'];
        if (!validCategories.includes(waterfallCategory)) {
            errors.push(`Invalid waterfall category. Must be one of: ${validCategories.join(', ')}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ============================================================================
    // ENHANCED BUDGET VALIDATION
    // ============================================================================

    /**
     * Validate adaptive priority creation
     */
    async validateAdaptivePriorityCreation(priorityData: {
        userId: string;
        category: 'survival' | 'security' | 'growth' | 'lifestyle';
        baseWeight: number;
        currentWeight?: number;
    }): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!priorityData.userId?.trim()) {
            errors.push('User ID is required');
        }

        if (!priorityData.category) {
            errors.push('Category is required');
        }

        if (priorityData.baseWeight === undefined || priorityData.baseWeight === null) {
            errors.push('Base weight is required');
        }

        // Category validation
        const validCategories = ['survival', 'security', 'growth', 'lifestyle'];
        if (priorityData.category && !validCategories.includes(priorityData.category)) {
            errors.push(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
        }

        // Weight validation
        if (priorityData.baseWeight !== undefined) {
            if (priorityData.baseWeight < 0 || priorityData.baseWeight > 1) {
                errors.push('Base weight must be between 0 and 1');
            }
        }

        if (priorityData.currentWeight !== undefined) {
            if (priorityData.currentWeight < 0 || priorityData.currentWeight > 1) {
                errors.push('Current weight must be between 0 and 1');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate adaptive priority updates
     */
    async validateAdaptivePriorityUpdate(priorityId: string, updates: {
        baseWeight?: number;
        currentWeight?: number;
        seasonalAdjustments?: Record<string, number>;
        lifeStageAdjustments?: Record<string, number>;
        stressAdjustments?: Record<string, number>;
    }): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Weight validation
        if (updates.baseWeight !== undefined) {
            if (updates.baseWeight < 0 || updates.baseWeight > 1) {
                errors.push('Base weight must be between 0 and 1');
            }
        }

        if (updates.currentWeight !== undefined) {
            if (updates.currentWeight < 0 || updates.currentWeight > 1) {
                errors.push('Current weight must be between 0 and 1');
            }
        }

        // Adjustment validation
        if (updates.seasonalAdjustments) {
            for (const [season, adjustment] of Object.entries(updates.seasonalAdjustments)) {
                if (adjustment < -1 || adjustment > 1) {
                    errors.push(`Seasonal adjustment for ${season} must be between -1 and 1`);
                }
            }
        }

        if (updates.lifeStageAdjustments) {
            for (const [stage, adjustment] of Object.entries(updates.lifeStageAdjustments)) {
                if (adjustment < -1 || adjustment > 1) {
                    errors.push(`Life stage adjustment for ${stage} must be between -1 and 1`);
                }
            }
        }

        if (updates.stressAdjustments) {
            for (const [stress, adjustment] of Object.entries(updates.stressAdjustments)) {
                if (adjustment < -1 || adjustment > 1) {
                    errors.push(`Stress adjustment for ${stress} must be between -1 and 1`);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ============================================================================
    // EXPORT VALIDATION
    // ============================================================================

    /**
     * Validate export options
     */
    async validateExportOptions(options: {
        format: 'csv' | 'json';
        dateRange?: {
            start: Date;
            end: Date;
        };
        accountIds?: string[];
        tagIds?: string[];
        includeAccounts?: boolean;
        includeTags?: boolean;
        includeBudgets?: boolean;
        includeGoals?: boolean;
        fields?: string[];
    }): Promise<EntityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Format validation
        if (!options.format || !['csv', 'json'].includes(options.format)) {
            errors.push('Invalid export format. Must be "csv" or "json"');
        }

        // Date range validation
        if (options.dateRange) {
            const dateValidation = this.validateDateFormat(options.dateRange.start.toISOString());
            if (!dateValidation.isValid) {
                errors.push('Invalid start date format');
            }

            const endDateValidation = this.validateDateFormat(options.dateRange.end.toISOString());
            if (!endDateValidation.isValid) {
                errors.push('Invalid end date format');
            }

            if (options.dateRange.start > options.dateRange.end) {
                errors.push('Start date must be before end date');
            }
        }

        // Account IDs validation
        if (options.accountIds?.length) {
            for (const accountId of options.accountIds) {
                const account = await db.accounts.get(accountId);
                if (!account || account.deletedAt) {
                    errors.push(`Account with ID ${accountId} not found or deleted`);
                }
            }
        }

        // Tag IDs validation
        if (options.tagIds?.length) {
            for (const tagId of options.tagIds) {
                const tag = await db.tags.get(tagId);
                if (!tag || tag.deletedAt) {
                    errors.push(`Tag with ID ${tagId} not found or deleted`);
                }
            }
        }

        // Fields validation
        if (options.fields?.length) {
            const validFields = [
                'id', 'date', 'amount', 'type', 'description', 'status',
                'accountId', 'accountName', 'whatTag', 'whatTagName',
                'whyTag', 'whyTagName', 'currency', 'createdAt', 'updatedAt'
            ];
            
            const invalidFields = options.fields.filter(field => !validFields.includes(field));
            if (invalidFields.length > 0) {
                errors.push(`Invalid fields: ${invalidFields.join(', ')}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ============================================================================
    // BULK VALIDATION
    // ============================================================================

    /**
     * Validate multiple entities at once
     */
    async validateMultipleTransactions(transactions: Partial<Transaction>[]): Promise<{
        valid: Partial<Transaction>[];
        invalid: Array<{ data: Partial<Transaction>; errors: string[] }>;
    }> {
        const valid: Partial<Transaction>[] = [];
        const invalid: Array<{ data: Partial<Transaction>; errors: string[] }> = [];

        for (const transaction of transactions) {
            const validation = await this.validateTransactionCreation(transaction);
            if (validation.isValid) {
                valid.push(transaction);
            } else {
                invalid.push({ data: transaction, errors: validation.errors });
            }
        }

        return { valid, invalid };
    }

    /**
     * Validate multiple accounts at once
     */
    async validateMultipleAccounts(accounts: Partial<Account>[]): Promise<{
        valid: Partial<Account>[];
        invalid: Array<{ data: Partial<Account>; errors: string[] }>;
    }> {
        const valid: Partial<Account>[] = [];
        const invalid: Array<{ data: Partial<Account>; errors: string[] }> = [];

        for (const account of accounts) {
            const validation = await this.validateAccountCreation(account);
            if (validation.isValid) {
                valid.push(account);
            } else {
                invalid.push({ data: account, errors: validation.errors });
            }
        }

        return { valid, invalid };
    }
}

export const validationService = new ValidationService(); 
