export { automationDetector } from './automation-detector';
export type { AutomationDetectionSummary } from './automation-detector';
export { detectEssentials } from './essential-detector';
export type { ClassificationCandidate } from './essential-detector';
export {
	TransactionSimilarityEngine,
	RECURRING_DETECTION_CONFIG,
	AUTOCOMPLETE_CONTEXT_CONFIG,
	ESSENTIAL_DETECTION_CONFIG,
	resolveSimilarityProfile
} from './transaction-similarity-engine';
export type {
	SimilarityDimension,
	SimilarityConfig,
	SimilarityResult,
	SimilarityProfileName
} from './transaction-similarity-engine';
