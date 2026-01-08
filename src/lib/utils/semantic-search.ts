import { isCloseMatch } from './levenshtein';

// ============================================================================
// SEMANTIC SEARCH UTILITY
// ============================================================================

/**
 * Semantic mappings for intelligent search relationships
 * Maps search terms to related business names, categories, and concepts
 */
export const SEMANTIC_MAPPINGS: Record<string, string[]> = {
	// Food & Dining
	'coffee': ['starbucks', 'dunkin', 'tim hortons', 'peets', 'costa', 'cafe', 'coffee shop', 'espresso', 'latte', 'cappuccino', 'mocha'],
	'food': ['restaurant', 'dining', 'meal', 'lunch', 'dinner', 'breakfast', 'cafe', 'bistro', 'grill', 'kitchen', 'eatery'],
	'dining': ['restaurant', 'food', 'meal', 'lunch', 'dinner', 'breakfast', 'cafe', 'bistro', 'grill', 'kitchen', 'eatery'],
	'groceries': ['grocery', 'supermarket', 'walmart', 'target', 'kroger', 'safeway', 'whole foods', 'trader joes', 'costco', 'sams club', 'aldi'],
	
	// Transportation & Fuel
	'gas': ['gasoline', 'fuel', 'petrol', 'shell', 'exxon', 'chevron', 'bp', 'mobil', 'gas station', 'fuel station', 'petrol station'],
	'transport': ['uber', 'lyft', 'taxi', 'bus', 'metro', 'subway', 'train', 'flight', 'airline', 'transit', 'public transport'],
	'ride': ['uber', 'lyft', 'taxi', 'ride share', 'ride sharing'],
	'flight': ['airline', 'airport', 'plane', 'aviation', 'delta', 'united', 'american', 'southwest', 'jetblue'],
	
	// Healthcare & Pharmacy
	'pharmacy': ['cvs', 'walgreens', 'rite aid', 'medicine', 'prescription', 'drugstore', 'pharmaceutical'],
	'healthcare': ['doctor', 'hospital', 'clinic', 'medical', 'pharmacy', 'dentist', 'optometrist', 'health', 'wellness'],
	'medical': ['doctor', 'hospital', 'clinic', 'healthcare', 'pharmacy', 'dentist', 'optometrist', 'health', 'wellness'],
	
	// Entertainment & Media
	'entertainment': ['netflix', 'spotify', 'hulu', 'disney', 'movie', 'cinema', 'theater', 'streaming', 'music', 'video', 'games'],
	'streaming': ['netflix', 'spotify', 'hulu', 'disney', 'youtube', 'prime', 'hbo', 'paramount', 'peacock'],
	'music': ['spotify', 'apple music', 'youtube music', 'pandora', 'soundcloud', 'concert', 'live music'],
	'movie': ['cinema', 'theater', 'netflix', 'hulu', 'disney', 'amc', 'regal', 'imax', 'film'],
	
	// Utilities & Services
	'utilities': ['electric', 'water', 'internet', 'phone', 'cable', 'wifi', 'electricity', 'power', 'utility'],
	'internet': ['wifi', 'broadband', 'cable', 'fiber', 'dsl', 'comcast', 'verizon', 'att', 'spectrum'],
	'phone': ['mobile', 'cell', 'verizon', 'att', 'tmobile', 'sprint', 'cellular', 'telephone'],
	
	// Retail & Shopping
	'retail': ['amazon', 'ebay', 'shop', 'store', 'mall', 'shopping', 'purchase', 'buy', 'marketplace'],
	'amazon': ['retail', 'shopping', 'purchase', 'buy', 'marketplace', 'prime', 'online'],
	'shopping': ['retail', 'store', 'mall', 'purchase', 'buy', 'marketplace', 'shop'],
	
	// Financial Services
	'banking': ['bank', 'atm', 'withdrawal', 'deposit', 'checking', 'savings', 'credit', 'debit'],
	'atm': ['bank', 'withdrawal', 'cash', 'banking', 'money'],
	'fee': ['charge', 'cost', 'penalty', 'fine', 'banking', 'service'],
	
	// Home & Living
	'rent': ['housing', 'apartment', 'lease', 'landlord', 'rental', 'home'],
	'housing': ['rent', 'apartment', 'lease', 'landlord', 'rental', 'home', 'mortgage'],
	
	// Education & Learning
	'education': ['school', 'university', 'college', 'course', 'learning', 'tuition', 'student'],
	'school': ['education', 'university', 'college', 'course', 'learning', 'tuition', 'student'],
	
	// Personal Care & Beauty
	'beauty': ['cosmetics', 'makeup', 'skincare', 'hair', 'salon', 'spa', 'beauty'],
	'fitness': ['gym', 'workout', 'exercise', 'fitness', 'health', 'sports', 'athletic'],
	'gym': ['fitness', 'workout', 'exercise', 'health', 'sports', 'athletic', 'membership']
};

/**
 * Search result interface
 */
export interface SemanticSearchResult {
	match: boolean;
	score: number;
	matchedFields: string[];
	matchedTerms: string[];
}

/**
 * Enhanced fuzzy search with semantic relationships
 * @param searchableFields - Array of text fields to search in
 * @param query - Search query string
 * @param threshold - Levenshtein distance threshold for fuzzy matching (default: 2)
 * @returns Search result with match status, score, and details
 */
export function semanticSearch(
	searchableFields: string[], 
	query: string, 
	threshold: number = 2
): SemanticSearchResult {
	const searchText = query.toLowerCase().trim();
	
	if (!searchText) {
		return { match: true, score: 0, matchedFields: [], matchedTerms: [] };
	}
	
	const matchedFields: string[] = [];
	const matchedTerms: string[] = [];
	
	// Check for exact matches first (highest score)
	for (const field of searchableFields) {
		if (field.includes(searchText)) {
			matchedFields.push(field);
			matchedTerms.push(searchText);
			return { match: true, score: 100, matchedFields, matchedTerms };
		}
	}
	
	// Check for semantic matches (business names, related terms)
	let semanticScore = 0;
	const semanticMatches: string[] = [];
	
	for (const [key, relatedTerms] of Object.entries(SEMANTIC_MAPPINGS)) {
		// If query matches a semantic key, check if any related terms appear in fields
		if (isCloseMatch(searchText, key, threshold)) {
			for (const term of relatedTerms) {
				for (const field of searchableFields) {
					if (field.includes(term) || isCloseMatch(term, field, threshold)) {
						semanticScore = Math.max(semanticScore, 90);
						if (!semanticMatches.includes(term)) semanticMatches.push(term);
						if (!matchedFields.includes(field)) matchedFields.push(field);
					}
				}
			}
		}
		
		// Also check if query matches any related terms directly
		for (const term of relatedTerms) {
			if (isCloseMatch(searchText, term, threshold)) {
				// Check if the semantic key appears in fields
				for (const field of searchableFields) {
					if (field.includes(key) || isCloseMatch(key, field, threshold)) {
						semanticScore = Math.max(semanticScore, 85);
						if (!semanticMatches.includes(key)) semanticMatches.push(key);
						if (!matchedFields.includes(field)) matchedFields.push(field);
					}
				}
			}
		}
	}
	
	// Check for fuzzy matches
	let bestScore = semanticScore;
	const fuzzyMatches: string[] = [];
	
	for (const field of searchableFields) {
		if (isCloseMatch(searchText, field, threshold + 1)) {
			// Calculate a score based on how close the match is
			const words = field.split(/\s+/);
			for (const word of words) {
				if (isCloseMatch(searchText, word, threshold)) {
					const distance = Math.abs(searchText.length - word.length);
					const score = Math.max(0, 100 - (distance * 10));
					bestScore = Math.max(bestScore, score);
					if (!fuzzyMatches.includes(word)) fuzzyMatches.push(word);
					if (!matchedFields.includes(field)) matchedFields.push(field);
				}
			}
		}
	}
	
	// Also check if query words match any words in the fields
	const queryWords = searchText.split(/\s+/);
	for (const queryWord of queryWords) {
		for (const field of searchableFields) {
			const fieldWords = field.split(/\s+/);
			for (const fieldWord of fieldWords) {
				if (isCloseMatch(queryWord, fieldWord, threshold)) {
					const distance = Math.abs(queryWord.length - fieldWord.length);
					const score = Math.max(0, 80 - (distance * 8));
					bestScore = Math.max(bestScore, score);
					if (!fuzzyMatches.includes(fieldWord)) fuzzyMatches.push(fieldWord);
					if (!matchedFields.includes(field)) matchedFields.push(field);
				}
			}
		}
	}
	
	matchedTerms.push(...semanticMatches, ...fuzzyMatches);
	
	return { 
		match: bestScore > 0, 
		score: bestScore, 
		matchedFields: [...new Set(matchedFields)], 
		matchedTerms: [...new Set(matchedTerms)]
	};
}

/**
 * Search transactions with semantic relationships
 * @param transaction - Transaction object to search
 * @param query - Search query string
 * @param getCategoryName - Function to get category name
 * @param getAccountName - Function to get account name
 * @param getTransactionAccountId - Function to get account ID
 * @returns Search result with match status, score, and details
 */
export function searchTransaction(
	transaction: any,
	query: string,
	getCategoryName: (transaction: any) => string,
	getAccountName: (accountId: string) => string,
	getTransactionAccountId: (transaction: any) => string
): SemanticSearchResult {
	const t = transaction.representative || transaction;
	
	// Get all searchable text fields
	// Note: whatTag and whyTag removed in simplified schema - using categoryId instead
	const searchableFields = [
		t.description || '',
		getCategoryName(transaction),
		getAccountName(getTransactionAccountId(transaction)),
		t.notes || ''
	].map(field => field.toLowerCase());
	
	return semanticSearch(searchableFields, query);
}

/**
 * Add new semantic mappings at runtime
 * @param mappings - New semantic mappings to add
 */
export function addSemanticMappings(mappings: Record<string, string[]>): void {
	Object.assign(SEMANTIC_MAPPINGS, mappings);
}

/**
 * Get all available semantic categories
 * @returns Array of semantic category keys
 */
export function getSemanticCategories(): string[] {
	return Object.keys(SEMANTIC_MAPPINGS);
}

/**
 * Get related terms for a specific category
 * @param category - Semantic category key
 * @returns Array of related terms or empty array if not found
 */
export function getRelatedTerms(category: string): string[] {
	return SEMANTIC_MAPPINGS[category.toLowerCase()] || [];
}
