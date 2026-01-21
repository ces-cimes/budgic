/**
 * CSV Parser Utility
 * 
 * Handles parsing of CSV files with proper escaping, quoted fields,
 * and conversion to structured data objects.
 */

import type { CSVFile } from './types';

/**
 * Parse a CSV string into structured data
 * 
 * @param csvContent - Raw CSV content as string
 * @param fileName - Name of the file (for error reporting)
 * @returns Parsed CSV file structure
 * @throws {Error} If CSV parsing fails
 * 
 * @example
 * ```typescript
 * const csvContent = `"ID","NAME","AMOUNT"\n"1","Test","100.0"`;
 * const parsed = parseCSV(csvContent, 'test.csv');
 * console.log(parsed.headers); // ['ID', 'NAME', 'AMOUNT']
 * console.log(parsed.rows[0]); // { ID: '1', NAME: 'Test', AMOUNT: '100.0' }
 * ```
 */
export function parseCSV(csvContent: string, fileName: string): CSVFile {
	try {
		// Money Manager CSVs can contain multiline quoted fields (e.g. ZDATA notes/description).
		// Splitting on newlines will corrupt those rows. Instead, split into records while
		// respecting quotes.
		const lines = splitCSVRecords(csvContent).filter((line) => line.trim().length > 0);
		
		if (lines.length === 0) {
			throw new Error(`CSV file ${fileName} is empty`);
		}

		// Parse headers (first line)
		const headers = parseCSVLine(lines[0]);
		
		if (headers.length === 0) {
			throw new Error(`CSV file ${fileName} has no headers`);
		}

		// Parse data rows
		const rows: Record<string, string>[] = [];
		
		for (let i = 1; i < lines.length; i++) {
			const values = parseCSVLine(lines[i]);
			
			// Skip rows that don't match header count (likely incomplete)
			if (values.length === headers.length) {
				const row: Record<string, string> = {};
				headers.forEach((header, index) => {
					row[header] = values[index] || '';
				});
				rows.push(row);
			}
		}

		return {
			name: fileName.replace('.csv', ''),
			headers,
			rows,
			rowCount: rows.length
		};
	} catch (error) {
		throw new Error(`Failed to parse CSV file ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Split raw CSV content into logical records while respecting multiline quoted fields.
 * A newline terminates a record only when we are not currently inside a quoted field.
 */
function splitCSVRecords(csvContent: string): string[] {
	const records: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < csvContent.length; i++) {
		const char = csvContent[i];
		const nextChar = csvContent[i + 1];

		if (char === '"') {
			// Escaped quote inside a quoted field ("")
			if (inQuotes && nextChar === '"') {
				current += '""';
				i++; // Skip the next quote
				continue;
			}

			inQuotes = !inQuotes;
			current += char;
			continue;
		}

		// Handle CRLF and LF line endings
		if ((char === '\n' || char === '\r') && !inQuotes) {
			// On CRLF, consume the LF after CR
			if (char === '\r' && nextChar === '\n') {
				i++;
			}

			records.push(current);
			current = '';
			continue;
		}

		current += char;
	}

	// Push trailing record
	if (current.length > 0) {
		records.push(current);
	}

	return records;
}

/**
 * Parse a single CSV line, handling quoted fields and escaped quotes
 * 
 * @param line - CSV line to parse
 * @returns Array of field values
 */
function parseCSVLine(line: string): string[] {
	const fields: string[] = [];
	let currentField = '';
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		const char = line[i];
		const nextChar = line[i + 1];

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				// Escaped quote (double quote)
				currentField += '"';
				i += 2;
			} else {
				// Toggle quote state
				inQuotes = !inQuotes;
				i++;
			}
		} else if (char === ',' && !inQuotes) {
			// Field separator (outside quotes)
			fields.push(currentField.trim());
			currentField = '';
			i++;
		} else {
			currentField += char;
			i++;
		}
	}

	// Add the last field
	fields.push(currentField.trim());

	return fields;
}

/**
 * Read a CSV file from a File object
 * 
 * @param file - File object to read
 * @returns Parsed CSV file structure
 * @throws {Error} If file reading fails
 * 
 * @example
 * ```typescript
 * const fileInput = document.querySelector('input[type="file"]');
 * const file = fileInput.files[0];
 * const csvData = await readCSVFile(file);
 * ```
 */
export async function readCSVFile(file: File): Promise<CSVFile> {
	try {
		const content = await file.text();
		return parseCSV(content, file.name);
	} catch (error) {
		throw new Error(`Failed to read CSV file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Read multiple CSV files
 * 
 * @param files - Array of File objects
 * @returns Map of file names to parsed CSV data
 * @throws {Error} If any file reading fails
 * 
 * @example
 * ```typescript
 * const files = Array.from(fileInput.files);
 * const csvFiles = await readMultipleCSVFiles(files);
 * const assetsData = csvFiles.get('ASSETS');
 * ```
 */
export async function readMultipleCSVFiles(files: File[]): Promise<Map<string, CSVFile>> {
	const csvFiles = new Map<string, CSVFile>();
	
	await Promise.all(
		files.map(async (file) => {
			if (file.name.endsWith('.csv')) {
				const csvData = await readCSVFile(file);
				csvFiles.set(csvData.name, csvData);
			}
		})
	);
	
	return csvFiles;
}

/**
 * Validate CSV file structure
 * 
 * @param csvFile - Parsed CSV file to validate
 * @param requiredColumns - Array of required column names
 * @returns Validation result with errors if any
 */
export function validateCSVStructure(
	csvFile: CSVFile,
	requiredColumns: string[]
): { isValid: boolean; errors: string[] } {
	const errors: string[] = [];
	
	// Check if required columns exist
	const missingColumns = requiredColumns.filter(col => !csvFile.headers.includes(col));
	if (missingColumns.length > 0) {
		errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
	}
	
	// Check if file has data
	if (csvFile.rowCount === 0) {
		errors.push('CSV file has no data rows');
	}
	
	return {
		isValid: errors.length === 0,
		errors
	};
}

