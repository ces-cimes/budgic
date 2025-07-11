import { db } from '../db.js';
import { validationService } from './validation-service';

export interface ExportOptions {
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
}

export interface ExportResult {
  data: string;
  filename: string;
  recordCount: number;
  format: string;
  timestamp: Date;
}

export interface ExportHistory {
  id: string;
  filename: string;
  format: string;
  recordCount: number;
  timestamp: Date;
  options: ExportOptions;
}

class ExportService {
  /**
   * Export transactions with filtering options
   */
  async exportTransactions(options: ExportOptions): Promise<ExportResult> {
    try {
      // Validate export options
      const validation = await validationService.validateExportOptions(options);
      if (!validation.isValid) {
        throw new Error(`Export validation failed: ${validation.errors.join(', ')}`);
      }

      // Fetch transactions with filtering
      let transactionData = await db.transactions.toArray();
      
      // Apply date range filter
      if (options.dateRange) {
        transactionData = transactionData.filter(transaction => {
          const transactionDate = new Date(transaction.clearedDate || transaction.plannedDate || transaction.createdAt);
          return transactionDate >= options.dateRange!.start && transactionDate <= options.dateRange!.end;
        });
      }
      
      // Apply account filter
      if (options.accountIds?.length) {
        transactionData = transactionData.filter(transaction => 
          options.accountIds!.includes(transaction.accountId)
        );
      }
      
      // Apply tag filter
      if (options.tagIds?.length) {
        transactionData = transactionData.filter(transaction => 
          transaction.whatTag && options.tagIds!.includes(transaction.whatTag)
        );
      }
      
      // Fetch related data if requested
      let accountData: any[] = [];
      let tagData: any[] = [];
      
      if (options.includeAccounts) {
        accountData = await db.accounts.toArray();
      }
      
      if (options.includeTags) {
        tagData = await db.tags.toArray();
      }
      
      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `budgic-export-${timestamp}.${options.format}`;
      
      // Format data based on export type
      let data: string;
      let recordCount: number;
      
      if (options.format === 'csv') {
        data = this.toCSV(transactionData, accountData, tagData, options);
        recordCount = transactionData.length;
      } else {
        data = this.toJSON(transactionData, accountData, tagData, options);
        recordCount = transactionData.length;
      }
      
      // Save export history
      await this.saveExportHistory({
        id: crypto.randomUUID(),
        filename,
        format: options.format,
        recordCount,
        timestamp: new Date(),
        options
      });
      
      return {
        data,
        filename,
        recordCount,
        format: options.format,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Export all data for backup purposes
   */
  async exportFullBackup(): Promise<ExportResult> {
    try {
      const [transactionData, accountData, tagData] = await Promise.all([
        db.transactions.toArray(),
        db.accounts.toArray(),
        db.tags.toArray()
      ]);
      
      const backupData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        data: {
          transactions: transactionData,
          accounts: accountData,
          tags: tagData
        }
      };
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `budgic-backup-${timestamp}.json`;
      
      return {
        data: JSON.stringify(backupData, null, 2),
        filename,
        recordCount: transactionData.length + accountData.length + tagData.length,
        format: 'json',
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Backup export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Convert data to CSV format
   */
  private toCSV(
    transactions: any[],
    accounts: any[],
    tags: any[],
    options: ExportOptions
  ): string {
    const accountMap = new Map(accounts.map(acc => [acc.id, acc]));
    const tagMap = new Map(tags.map(tag => [tag.id, tag]));
    
    // Define CSV headers
    const headers = [
      'id',
      'date',
      'amount',
      'type',
      'description',
      'status',
      'accountId',
      'accountName',
      'whatTag',
      'whatTagName',
      'whyTag',
      'whyTagName',
      'currency',
      'createdAt',
      'updatedAt'
    ];
    
    // Filter headers based on options
    const selectedHeaders = options.fields?.length 
      ? headers.filter(h => options.fields!.includes(h))
      : headers;
    
    // Create CSV content
    const csvRows = [selectedHeaders.join(',')];
    
    for (const transaction of transactions) {
      const account = accountMap.get(transaction.accountId);
      const whatTag = tagMap.get(transaction.whatTag);
      const whyTag = tagMap.get(transaction.whyTag);
      
      const row = selectedHeaders.map(header => {
        let value = transaction[header];
        
        // Handle related data
        if (header === 'accountName') {
          value = account?.name || '';
        } else if (header === 'whatTagName') {
          value = whatTag?.name || '';
        } else if (header === 'whyTagName') {
          value = whyTag?.name || '';
        }
        
        // Escape CSV values
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        
        return value || '';
      });
      
      csvRows.push(row.join(','));
    }
    
    return csvRows.join('\n');
  }
  
  /**
   * Convert data to JSON format
   */
  private toJSON(
    transactions: any[],
    accounts: any[],
    tags: any[],
    options: ExportOptions
  ): string {
    const exportData: any = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      transactions: transactions
    };
    
    if (options.includeAccounts) {
      exportData.accounts = accounts;
    }
    
    if (options.includeTags) {
      exportData.tags = tags;
    }
    
    return JSON.stringify(exportData, null, 2);
  }
  
  /**
   * Save export history
   */
  private async saveExportHistory(history: ExportHistory): Promise<void> {
    // In a real implementation, this would save to a database table
    console.log('Export history saved:', history);
  }
  
  /**
   * Get export history
   */
  async getExportHistory(): Promise<ExportHistory[]> {
    // In a real implementation, this would fetch from a database table
    return [];
  }
  

}

export const exportService = new ExportService(); 