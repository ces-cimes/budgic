export { automationDetector } from './automation-detector';
export type { AutomationDetectionSummary } from './automation-detector';
export { detectEssentials } from './essential-detector';
export type { ClassificationCandidate } from './essential-detector';
export {
	TransactionSimilarityEngine,
	RECURRING_CANONICAL_CACHE_KEY,
	RECURRING_DETECTION_CONFIG,
	AUTOCOMPLETE_CONTEXT_CONFIG,
	ESSENTIAL_DETECTION_CONFIG,
	resolveSimilarityProfile
} from './transaction-similarity-engine';
export { expandEssentialCandidatesWithSimilarity } from './essential-candidate-similarity';
export type { EssentialCandidateSerialized } from './essential-candidate-similarity';
export { buildUnclassifiedPatternHints } from './import-pattern-hints';
export type { ImportPatternHint } from './import-pattern-hints';
export {
	mergeDailyMicroInterestTransactions,
	recalculateBalancesForAccounts
} from './interest-daily-merge';
export type {
	SimilarityDimension,
	SimilarityConfig,
	SimilarityResult,
	SimilarityProfileName
} from './transaction-similarity-engine';
export { merchantProfileService } from './merchant-profile-service';
