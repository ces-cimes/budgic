/**
 * Platform-aware file picker utilities
 *
 * Handles file picking across web and native platforms (Android/iOS)
 * using Capacitor's file picker plugin for native platforms and
 * HTML file input for web.
 */

import { Capacitor } from '@capacitor/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';

/**
 * Check if running on a native platform (Android/iOS)
 */
export function isNativePlatform(): boolean {
	return Capacitor.isNativePlatform();
}

/**
 * Check if running on Android
 */
export function isAndroid(): boolean {
	return Capacitor.getPlatform() === 'android';
}

/**
 * Check if running on iOS
 */
export function isIOS(): boolean {
	return Capacitor.getPlatform() === 'ios';
}

/**
 * Check if running on web
 */
export function isWeb(): boolean {
	return Capacitor.getPlatform() === 'web';
}

/**
 * File picker options
 */
export interface FilePickerOptions {
	/**
	 * Accepted MIME types (e.g., ['text/csv', 'application/json'])
	 */
	types?: string[];
	/**
	 * Accepted file extensions (e.g., ['.csv', '.json'])
	 */
	extensions?: string[];
	/**
	 * Allow multiple file selection
	 */
	multiple?: boolean;
}

/**
 * Result from file picker
 */
export interface FilePickerResult {
	/**
	 * Array of selected files
	 */
	files: File[];
	/**
	 * Whether the user cancelled the selection
	 */
	cancelled: boolean;
}

/**
 * Pick files using platform-appropriate method
 *
 * On native platforms (Android/iOS), uses Capacitor's FilePicker plugin.
 * On web, uses HTML file input element.
 *
 * @param options - File picker options
 * @returns Promise resolving to file picker result
 *
 * @example
 * ```typescript
 * // Pick CSV files
 * const result = await pickFiles({
 *   types: ['text/csv'],
 *   multiple: true
 * });
 *
 * if (!result.cancelled && result.files.length > 0) {
 *   // Process files
 *   for (const file of result.files) {
 *     const content = await file.text();
 *     // ...
 *   }
 * }
 * ```
 */
export async function pickFiles(options: FilePickerOptions = {}): Promise<FilePickerResult> {
	const { types = [], extensions = [], multiple = false } = options;

	if (isNativePlatform()) {
		// Use Capacitor FilePicker for native platforms
		try {
			// Convert extensions to MIME types if needed
			let mimeTypes = types;
			if (extensions.length > 0 && mimeTypes.length === 0) {
				// Map common extensions to MIME types
				mimeTypes = extensions.map((ext) => {
					switch (ext.toLowerCase()) {
						case '.csv':
							return 'text/csv';
						case '.json':
							return 'application/json';
						case '.txt':
							return 'text/plain';
						default:
							return '*/*';
					}
				});
			}

			// If no types specified, allow all files
			if (mimeTypes.length === 0) {
				mimeTypes = ['*/*'];
			}

			const result = await FilePicker.pickFiles({
				types: mimeTypes,
				limit: multiple ? 0 : 1
			});

			if (!result.files || result.files.length === 0) {
				return { files: [], cancelled: true };
			}

			// Convert Capacitor file results to File objects
			const files: File[] = await Promise.all(
				result.files.map(async (file) => {
					// Use blob property if available (preferred method, more memory efficient)
					if (file.blob) {
						const fileObj = new File([file.blob], file.name, {
							type: file.mimeType || 'application/octet-stream',
							lastModified: file.modifiedAt
								? new Date(file.modifiedAt).getTime()
								: Date.now()
						});
						return fileObj;
					}

					// Fallback to base64 data if blob is not available
					if (file.data) {
						const base64Data = file.data;

						// Handle data URL format (data:text/csv;base64,...)
						let actualBase64 = base64Data;
						if (base64Data.includes(',')) {
							actualBase64 = base64Data.split(',')[1];
						}

						// Convert base64 to blob
						const byteCharacters = atob(actualBase64);
						const byteNumbers = new Array(byteCharacters.length);
						for (let i = 0; i < byteCharacters.length; i++) {
							byteNumbers[i] = byteCharacters.charCodeAt(i);
						}
						const byteArray = new Uint8Array(byteNumbers);
						const blob = new Blob([byteArray], {
							type: file.mimeType || 'application/octet-stream'
						});

						// Create File object from blob
						const fileObj = new File([blob], file.name, {
							type: file.mimeType || 'application/octet-stream',
							lastModified: file.modifiedAt
								? new Date(file.modifiedAt).getTime()
								: Date.now()
						});
						return fileObj;
					}

					// Fallback: Use file path/uri with fetch API (for Android when blob/data not available)
					const filePath = (file as any).path || (file as any).uri;
					if (filePath) {
						try {
							// Convert file path to web-accessible URL
							const webPath = Capacitor.convertFileSrc(filePath);
							const response = await fetch(webPath);
							const blob = await response.blob();

							const fileObj = new File([blob], file.name, {
								type: file.mimeType || blob.type || 'application/octet-stream',
								lastModified: file.modifiedAt
									? new Date(file.modifiedAt).getTime()
									: Date.now()
							});
							return fileObj;
						} catch (fetchError) {
							console.error('Failed to fetch file from path:', filePath, fetchError);
							throw new Error(
								`Failed to read file ${file.name} from path: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`
							);
						}
					}

					// If no data, blob, or path is available, throw error
					throw new Error(
						`File ${file.name} has no data, blob, or path property. Available properties: ${Object.keys(file).join(', ')}`
					);
				})
			);

			return { files, cancelled: false };
		} catch (error) {
			// User cancelled or error occurred
			if (error instanceof Error && error.message.includes('cancel')) {
				return { files: [], cancelled: true };
			}
			throw new Error(
				`Failed to pick files: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	} else {
		// Use HTML file input for web
		return new Promise<FilePickerResult>((resolve) => {
			const input = document.createElement('input');
			input.type = 'file';
			input.multiple = multiple;

			// Set accept attribute based on types/extensions
			if (types.length > 0) {
				input.accept = types.join(',');
			} else if (extensions.length > 0) {
				input.accept = extensions.join(',');
			}

			input.onchange = (event) => {
				const target = event.target as HTMLInputElement;
				const selectedFiles = Array.from(target.files || []);

				// Filter by extensions if specified
				let filteredFiles = selectedFiles;
				if (extensions.length > 0) {
					filteredFiles = selectedFiles.filter((file) => {
						const fileName = file.name.toLowerCase();
						return extensions.some((ext) => fileName.endsWith(ext.toLowerCase()));
					});
				}

				resolve({
					files: filteredFiles,
					cancelled: filteredFiles.length === 0
				});
			};

			input.oncancel = () => {
				resolve({ files: [], cancelled: true });
			};

			// Trigger file picker
			input.click();
		});
	}
}

/**
 * Pick a single file
 *
 * Convenience wrapper around pickFiles for single file selection
 *
 * @param options - File picker options
 * @returns Promise resolving to the selected file or null if cancelled
 */
export async function pickFile(
	options: Omit<FilePickerOptions, 'multiple'> = {}
): Promise<File | null> {
	const result = await pickFiles({ ...options, multiple: false });

	if (result.cancelled || result.files.length === 0) {
		return null;
	}

	return result.files[0];
}

/**
 * Pick multiple files
 *
 * Convenience wrapper around pickFiles for multiple file selection
 *
 * @param options - File picker options
 * @returns Promise resolving to array of selected files (empty if cancelled)
 */
export async function pickMultipleFiles(
	options: Omit<FilePickerOptions, 'multiple'> = {}
): Promise<File[]> {
	const result = await pickFiles({ ...options, multiple: true });
	return result.files;
}
