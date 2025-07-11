import { db } from '../db.js';
import { validateAmount, isValidCurrencyCode } from '$lib/utils/currency-utils';
import { dateUtils } from '$lib/utils/date-utils';

export interface ImportData {
  transactions?: any[];
  accounts?: any[];
  tags?: any[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
    duplicateRecords: number;
  };
  preview: {
    transactions?: any[];
    accounts?: any[];
    tags?: any[];
  };
}

export interface ImportOptions {
  skipDuplicates?: boolean;
  updateExisting?: boolean;
  validateOnly?: boolean;
  transformData?: boolean;
}

class ImportValidationService {
  /**
   * Validate imported data
   */
  async validateImportData(data: ImportData, options: ImportOptions = {}): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalRecords = 0;
    let validRecords = 0;
    let invalidRecords = 0;
    let duplicateRecords = 0;

    // Validate transactions
    if (data.transactions?.length) {
      const transactionValidation = await this.validateTransactions(data.transactions, options);
      errors.push(...transactionValidation.errors);
      warnings.push(...transactionValidation.warnings);
      totalRecords += transactionValidation.summary.totalRecords;
      validRecords += transactionValidation.summary.validRecords;
      invalidRecords += transactionValidation.summary.invalidRecords;
      duplicateRecords += transactionValidation.summary.duplicateRecords;
    }

    // Validate accounts
    if (data.accounts?.length) {
      const accountValidation = await this.validateAccounts(data.accounts, options);
      errors.push(...accountValidation.errors);
      warnings.push(...accountValidation.warnings);
      totalRecords += accountValidation.summary.totalRecords;
      validRecords += accountValidation.summary.validRecords;
      invalidRecords += accountValidation.summary.invalidRecords;
      duplicateRecords += accountValidation.summary.duplicateRecords;
    }

    // Validate tags
    if (data.tags?.length) {
      const tagValidation = await this.validateTags(data.tags, options);
      errors.push(...tagValidation.errors);
      warnings.push(...tagValidation.warnings);
      totalRecords += tagValidation.summary.totalRecords;
      validRecords += tagValidation.summary.validRecords;
      invalidRecords += tagValidation.summary.invalidRecords;
      duplicateRecords += tagValidation.summary.duplicateRecords;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalRecords,
        validRecords,
        invalidRecords,
        duplicateRecords
      },
      preview: {
        transactions: data.transactions?.slice(0, 10), // Show first 10 records
        accounts: data.accounts?.slice(0, 10),
        tags: data.tags?.slice(0, 10)
      }
    };
  }

  /**
   * Validate transaction data
   */
  private async validateTransactions(transactions: any[], options: ImportOptions): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let validRecords = 0;
    let invalidRecords = 0;
    let duplicateRecords = 0;

    // Get existing data for duplicate checking
    const existingTransactions = await db.transactions.toArray();
    const existingAccounts = await db.accounts.toArray();
    const existingTags = await db.tags.toArray();

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      const rowNumber = i + 1;
      let isValid = true;

      // Required fields validation
      if (!transaction.amount || typeof transaction.amount !== 'number') {
        errors.push(`Row ${rowNumber}: Invalid or missing amount`);
        isValid = false;
      }

      if (!transaction.type || !['income', 'expense', 'transfer', 'adjustment'].includes(transaction.type)) {
        errors.push(`Row ${rowNumber}: Invalid transaction type`);
        isValid = false;
      }

      if (!transaction.status || !['planned', 'pending', 'cleared', 'cancelled'].includes(transaction.status)) {
        errors.push(`Row ${rowNumber}: Invalid transaction status`);
        isValid = false;
      }

      // Currency validation
      if (transaction.currency) {
        const currencyValidation = isValidCurrencyCode(transaction.currency);
        if (!currencyValidation) {
          errors.push(`Row ${rowNumber}: Invalid currency code`);
          isValid = false;
        }
      }

      // Amount validation
      if (transaction.amount && transaction.currency) {
        const amountValidation = validateAmount(transaction.amount, transaction.currency);
        if (!amountValidation.isValid) {
          errors.push(`Row ${rowNumber}: ${amountValidation.error}`);
          isValid = false;
        }
      }

      // Date validation
      if (transaction.clearedDate) {
        const dateValidation = dateUtils.validateTransactionDate(transaction.clearedDate, transaction.status);
        if (!dateValidation.isValid) {
          errors.push(`Row ${rowNumber}: ${dateValidation.error}`);
          isValid = false;
        }
      }

      // Account validation
      if (transaction.accountId) {
        const accountExists = existingAccounts.some(acc => acc.id === transaction.accountId);
        if (!accountExists) {
          warnings.push(`Row ${rowNumber}: Account ID not found in database`);
        }
      }

      // Tag validation
      if (transaction.whatTag) {
        const tagExists = existingTags.some(tag => tag.id === transaction.whatTag);
        if (!tagExists) {
          warnings.push(`Row ${rowNumber}: What tag not found in database`);
        }
      }

      // Duplicate detection
      const isDuplicate = existingTransactions.some(existing => 
        existing.amount === transaction.amount &&
        existing.type === transaction.type &&
        existing.accountId === transaction.accountId &&
        existing.clearedDate === transaction.clearedDate
      );

      if (isDuplicate) {
        duplicateRecords++;
        if (!options.skipDuplicates) {
          warnings.push(`Row ${rowNumber}: Potential duplicate transaction detected`);
        }
      }

      if (isValid) {
        validRecords++;
      } else {
        invalidRecords++;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalRecords: transactions.length,
        validRecords,
        invalidRecords,
        duplicateRecords
      },
      preview: { transactions: transactions.slice(0, 10) }
    };
  }

  /**
   * Validate account data
   */
  private async validateAccounts(accounts: any[], options: ImportOptions): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let validRecords = 0;
    let invalidRecords = 0;
    let duplicateRecords = 0;

    const existingAccounts = await db.accounts.toArray();

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const rowNumber = i + 1;
      let isValid = true;

      // Required fields validation
      if (!account.name || typeof account.name !== 'string') {
        errors.push(`Row ${rowNumber}: Invalid or missing account name`);
        isValid = false;
      }

      if (!account.type || !['checking', 'savings', 'credit', 'investment', 'cash'].includes(account.type)) {
        errors.push(`Row ${rowNumber}: Invalid account type`);
        isValid = false;
      }

      // Currency validation
      if (account.currency) {
        const currencyValidation = isValidCurrencyCode(account.currency);
        if (!currencyValidation) {
          errors.push(`Row ${rowNumber}: Invalid currency code`);
          isValid = false;
        }
      }

      // Balance validation
      if (account.currentBalance !== undefined && typeof account.currentBalance !== 'number') {
        errors.push(`Row ${rowNumber}: Invalid balance amount`);
        isValid = false;
      }

      // Duplicate detection
      const isDuplicate = existingAccounts.some(existing => 
        existing.name === account.name && existing.type === account.type
      );

      if (isDuplicate) {
        duplicateRecords++;
        if (!options.skipDuplicates) {
          warnings.push(`Row ${rowNumber}: Potential duplicate account detected`);
        }
      }

      if (isValid) {
        validRecords++;
      } else {
        invalidRecords++;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalRecords: accounts.length,
        validRecords,
        invalidRecords,
        duplicateRecords
      },
      preview: { accounts: accounts.slice(0, 10) }
    };
  }

  /**
   * Validate tag data
   */
  private async validateTags(tags: any[], options: ImportOptions): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let validRecords = 0;
    let invalidRecords = 0;
    let duplicateRecords = 0;

    const existingTags = await db.tags.toArray();

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const rowNumber = i + 1;
      let isValid = true;

      // Required fields validation
      if (!tag.name || typeof tag.name !== 'string') {
        errors.push(`Row ${rowNumber}: Invalid or missing tag name`);
        isValid = false;
      }

      if (!tag.dimension || !['what', 'why'].includes(tag.dimension)) {
        errors.push(`Row ${rowNumber}: Invalid tag dimension`);
        isValid = false;
      }

      // Duplicate detection
      const isDuplicate = existingTags.some(existing => 
        existing.name === tag.name && existing.dimension === tag.dimension
      );

      if (isDuplicate) {
        duplicateRecords++;
        if (!options.skipDuplicates) {
          warnings.push(`Row ${rowNumber}: Potential duplicate tag detected`);
        }
      }

      if (isValid) {
        validRecords++;
      } else {
        invalidRecords++;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalRecords: tags.length,
        validRecords,
        invalidRecords,
        duplicateRecords
      },
      preview: { tags: tags.slice(0, 10) }
    };
  }

  /**
   * Transform imported data to match database schema
   */
  transformImportData(data: ImportData): ImportData {
    const transformed: ImportData = {};

    if (data.transactions) {
      transformed.transactions = data.transactions.map(transaction => ({
        ...transaction,
        id: transaction.id || crypto.randomUUID(),
        createdAt: transaction.createdAt || new Date().toISOString(),
        updatedAt: transaction.updatedAt || new Date().toISOString(),
        deletedAt: null
      }));
    }

    if (data.accounts) {
      transformed.accounts = data.accounts.map(account => ({
        ...account,
        id: account.id || crypto.randomUUID(),
        createdAt: account.createdAt || new Date().toISOString(),
        updatedAt: account.updatedAt || new Date().toISOString(),
        deletedAt: null
      }));
    }

    if (data.tags) {
      transformed.tags = data.tags.map(tag => ({
        ...tag,
        id: tag.id || crypto.randomUUID(),
        createdAt: tag.createdAt || new Date().toISOString(),
        updatedAt: tag.updatedAt || new Date().toISOString(),
        deletedAt: null
      }));
    }

    return transformed;
  }

  /**
   * Generate import summary report
   */
  generateImportReport(validationResult: ValidationResult): string {
    const { summary, errors, warnings } = validationResult;
    
    let report = `Import Summary Report\n`;
    report += `====================\n\n`;
    report += `Total Records: ${summary.totalRecords}\n`;
    report += `Valid Records: ${summary.validRecords}\n`;
    report += `Invalid Records: ${summary.invalidRecords}\n`;
    report += `Duplicate Records: ${summary.duplicateRecords}\n\n`;

    if (errors.length > 0) {
      report += `Errors (${errors.length}):\n`;
      errors.forEach(error => report += `- ${error}\n`);
      report += `\n`;
    }

    if (warnings.length > 0) {
      report += `Warnings (${warnings.length}):\n`;
      warnings.forEach(warning => report += `- ${warning}\n`);
      report += `\n`;
    }

    const successRate = summary.totalRecords > 0 ? (summary.validRecords / summary.totalRecords * 100).toFixed(1) : '0';
    report += `Success Rate: ${successRate}%\n`;

    return report;
  }
}

export const importValidationService = new ImportValidationService(); 