/**
 * Sidebar footer info cards: registry and metadata for settings & rendering.
 */

export const SIDEBAR_FOOTER_CARD_IDS = ['total_balance', 'today_allowance'] as const;
export type SidebarFooterCardId = (typeof SIDEBAR_FOOTER_CARD_IDS)[number];

export interface SidebarFooterCardMeta {
	id: SidebarFooterCardId;
	label: string;
	description: string;
}

export const SIDEBAR_FOOTER_CARDS: Record<SidebarFooterCardId, SidebarFooterCardMeta> = {
	total_balance: {
		id: 'total_balance',
		label: 'Total balance',
		description: 'Sum of all account balances in your main currency'
	},
	today_allowance: {
		id: 'today_allowance',
		label: "Today's allowance",
		description: 'Daily spending allowance and progress for the current period'
	}
};

export const DEFAULT_SIDEBAR_FOOTER_CARDS: SidebarFooterCardId[] = ['total_balance', 'today_allowance'];
