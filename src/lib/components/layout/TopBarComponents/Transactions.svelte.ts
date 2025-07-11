// Transaction state interface
export interface TransactionState {
	searchQuery: string;
	selectedFilterIndex: number;
	selectedSortIndex: number;
	isMultiSelectMode: boolean;
}

// Filter and sort options
export const filterOptions = ['All', 'This month', 'Groceries', 'Split transactions', 'Planned'];
export const sortOptions = ['Date', 'Amount', 'Category'];

// Reactive store for transaction state
export const transactionStore = $state<TransactionState>({
	searchQuery: '',
	selectedFilterIndex: 0,
	selectedSortIndex: 0,
	isMultiSelectMode: false
});

// Actions for updating the store
export const transactionActions = {
	setSearchQuery: (query: string) => {
		transactionStore.searchQuery = query;
	},
	
	setFilterIndex: (index: number) => {
		transactionStore.selectedFilterIndex = index;
	},
	
	setSortIndex: (index: number) => {
		transactionStore.selectedSortIndex = index;
	},
	
	toggleMultiSelect: (clearSelections?: () => void) => {
		const wasMultiSelectMode = transactionStore.isMultiSelectMode;
		transactionStore.isMultiSelectMode = !transactionStore.isMultiSelectMode;
		
		// If we're turning off multi-select mode, clear selections
		if (wasMultiSelectMode && clearSelections) {
			clearSelections();
		}
	},
	
	clearMultiSelect: () => {
		transactionStore.isMultiSelectMode = false;
	},
	
	resetFilters: () => {
		transactionStore.searchQuery = '';
		transactionStore.selectedFilterIndex = 0;
		transactionStore.selectedSortIndex = 0;
	}
}; 