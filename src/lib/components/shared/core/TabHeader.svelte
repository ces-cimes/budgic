<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.ts';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import type { TabConfig, TabHeaderVariant } from '../types.js';

	interface Props {
		tabs: TabConfig[];
		activeTab: string;
		onTabChange: (tabId: string) => void;
		/** Visual style: pill (default) or underline */
		variant?: TabHeaderVariant;
		className?: string;
		/** When true, pill row stays visible on desktop (default: pills hide on desktop — sidebar has tab links). */
		alwaysShow?: boolean;
	}

	const {
		tabs,
		activeTab,
		onTabChange,
		variant = 'pill',
		className = '',
		alwaysShow = false
	}: Props = $props();

	const sidebar = Sidebar.useSidebar();

	/** Underline variant always shows; pill hides on desktop unless forced. */
	const showTabRow = $derived(variant === 'underline' || alwaysShow || sidebar.isMobile);

	const nTabs = $derived(tabs.length);
	/** Full-width equal segments when a modest number of tabs; more → horizontal scroll with min widths. */
	const useEqualWidthPills = $derived(variant === 'pill' && nTabs > 0 && nTabs <= 4);

	let tabContainer = $state<HTMLDivElement | undefined>(undefined);

	/**
	 * Inline `border-radius` beats `tabs-trigger`'s `rounded-md` and avoids overlap-scale killing small radii
	 * (do not pair astronomical px with tiny px on the same edge — see MDN “overlapping radii”).
	 *
	 * Use **uniform lengths only** (`lh`, `rem`, `var(--radius-sm)`): any **percentage** in `border-radius`
	 * resolves horizontal vs vertical radii against **width vs height**, so wide pills get **oval** corners.
	 * Likewise avoid `cqh`/`cqi` mixes that min different bases into one radius.
	 *
	 * End cap ≈ half pill height: `0.5 * (1lh + 0.5rem)` matches `py-1` (0.25rem × 2) + line box.
	 * Soft ceiling only for extreme `lh`; avoid a low `min()` that flattens stadium ends.
	 * Order: top-left, top-right, bottom-right, bottom-left.
	 */
	function pillRadiusStyle(index: number, total: number): string {
		const sm = 'var(--radius-sm)';
		const cap = 'max(var(--radius-sm), min(1.75rem, calc(0.5 * (1lh + 0.5rem) - 0.5px)))';
		if (total <= 1) return `border-radius: ${cap};`;
		if (index === 0) return `border-radius: ${cap} ${sm} ${sm} ${cap};`;
		if (index === total - 1) return `border-radius: ${sm} ${cap} ${cap} ${sm};`;
		return `border-radius: ${sm};`;
	}

	function handleWheelScroll(event: WheelEvent) {
		event.preventDefault();
		if (tabContainer) {
			tabContainer.scrollLeft += event.deltaY * 0.5;
		}
	}

	function scrollActiveTabIntoView() {
		if (tabContainer) {
			let activeTabElement = tabContainer.querySelector(
				`[data-state="active"]`
			) as HTMLElement;
			if (!activeTabElement) {
				activeTabElement = tabContainer.querySelector(
					`[value="${activeTab}"]`
				) as HTMLElement;
			}
			if (!activeTabElement) {
				activeTabElement = tabContainer.querySelector(
					`[data-value="${activeTab}"]`
				) as HTMLElement;
			}
			if (activeTabElement) {
				requestAnimationFrame(() => {
					activeTabElement.scrollIntoView({
						behavior: 'smooth',
						block: 'nearest',
						inline: 'center'
					});
				});
			}
		}
	}

	$effect(() => {
		activeTab;
		setTimeout(() => {
			scrollActiveTabIntoView();
		}, 50);
	});
</script>

{#if variant === 'pill' && !showTabRow}
	<!-- Desktop: tab switching lives in the sidebar; skip duplicate header pills. -->
{:else}
	<Tabs.Root value={activeTab} onValueChange={onTabChange} class="w-full max-w-full min-w-0">
		<div
			bind:this={tabContainer}
			class="scrollbar-hide glass box-border w-full max-w-full min-w-0 overflow-x-auto overflow-y-visible {variant ===
			'pill'
				? 'rounded-full p-1'
				: ''} {className}"
			style="scrollbar-width: none; -ms-overflow-style: none;"
			onwheel={handleWheelScroll}
		>
			<Tabs.List
				class={variant === 'pill'
					? useEqualWidthPills
						? 'flex h-auto w-full max-w-full min-w-0 items-stretch gap-0.5 rounded-none bg-transparent p-0'
						: 'inline-flex h-auto max-w-none items-stretch gap-0.5 rounded-none bg-transparent p-0'
					: 'h-auto w-full justify-start rounded-none bg-transparent p-0'}
			>
				{#each tabs as tab, i (tab.id)}
					<Tabs.Trigger
						value={tab.id}
						style={variant === 'pill' ? pillRadiusStyle(i, nTabs) : undefined}
						class={variant === 'pill'
							? `flex !h-auto min-h-0 min-w-0 items-center justify-center gap-1.5 overflow-visible border-0 bg-transparent px-2 py-1 text-xs leading-normal font-medium text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)] data-[state=active]:bg-[var(--color-amber-subtle)] data-[state=active]:text-[var(--color-amber)] data-[state=active]:shadow-none ${useEqualWidthPills ? 'flex-1' : 'min-w-[4.25rem] shrink-0'}`
							: 'hover:bg-secondary/20 data-[state=active]:border-primary flex items-center gap-2 rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-4 py-2 whitespace-nowrap transition-all data-[state=active]:bg-transparent data-[state=active]:shadow-none'}
					>
						{#if tab.icon}
							<tab.icon
								class={variant === 'pill'
									? 'size-3.5 shrink-0'
									: 'h-4 w-4 shrink-0'}
							/>
						{/if}
						<span class={variant === 'pill' ? 'min-w-0 shrink whitespace-nowrap' : ''}
							>{tab.label}</span
						>
					</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</div>
	</Tabs.Root>
{/if}

<style>
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
