<script lang="ts">
	interface Props {
		icon: string;
		title: string;
		description: string;
		onClick?: () => void;
		variant?: 'default' | 'destructive' | 'info';
		showChevron?: boolean;
		actionButton?: {
			label: string;
			variant?: 'primary' | 'secondary' | 'danger';
			onClick: () => void;
		};
	}

	let {
		icon,
		title,
		description,
		onClick,
		variant = 'default',
		showChevron = false,
		actionButton
	}: Props = $props();

	import { ChevronRight } from '@lucide/svelte';
	import Button from '$lib/components/primitives/Button.svelte';

	// Variant-specific styling
	const variantStyles = $derived(() => {
		switch (variant) {
			case 'destructive':
				return {
					container: 'border-2 border-dashed border-warm-coral/30 group-hover:border-warm-coral/50',
					overlay: 'from-warm-coral/[0.02] to-transparent',
					iconBg: 'bg-warm-coral/10',
					titleColor: 'text-warm-coral',
					hoverOverlay: 'from-warm-coral/0 to-warm-coral/5',
					focusRing: 'focus:ring-warm-coral'
				};
			case 'info':
				return {
					container: 'border-2 border-dashed border-info/30 group-hover:border-info/50',
					overlay: 'from-info/[0.02] to-transparent',
					iconBg: 'bg-info/10',
					titleColor: 'text-info',
					hoverOverlay: 'from-info/0 to-info/5',
					focusRing: 'focus:ring-info'
				};
			default:
				return {
					container: '',
					overlay: 'from-warm-ivory/[0.02] to-transparent',
					iconBg: 'bg-bg-tertiary',
					titleColor: 'text-text-primary',
					hoverOverlay: 'from-golden-amber/0 to-golden-amber/5',
					focusRing: 'focus:ring-info'
				};
		}
	});

	const isInteractive = $derived(() => onClick || actionButton);
</script>

<div class="relative group">
	<div class="relative overflow-hidden rounded-xl transition-all duration-300 ease-out
			   bg-bg-secondary backdrop-blur-sm {variantStyles().container}
			   hover:shadow-xl hover:shadow-bg-primary/30
			   hover:scale-[1.008] hover:-translate-y-[0.5]
			   group-hover:border-golden-amber/50">
		<!-- Subtle gradient overlay for depth -->
		<div class="absolute inset-0 bg-gradient-to-br {variantStyles().overlay} pointer-events-none"></div>
		
		{#if isInteractive()}
			<button
				class="w-full flex items-center p-2 gap-4 text-left relative z-10
					   focus:outline-none focus:ring-2 {variantStyles().focusRing} focus:ring-offset-2 focus:ring-offset-bg-primary
					   transition-all duration-200"
				onclick={onClick}
			>
				<!-- Icon container with enhanced styling -->
				<div class="flex-shrink-0 relative">
					<div class="w-12 h-12 rounded-full {variantStyles().iconBg} flex items-center justify-center
								transition-all duration-200 group-hover:scale-110">
						<span class="text-2xl">{icon}</span>
					</div>
				</div>
				
				<!-- Content -->
				<div class="flex-1 min-w-0">
					<div class="font-semibold {variantStyles().titleColor} text-base mb-1">
						{title}
					</div>
					<div class="text-sm text-text-secondary leading-relaxed">
						{description}
					</div>
				</div>
				
				<!-- Action elements -->
				<div class="flex-shrink-0 flex items-center gap-2">
					{#if actionButton}
						<Button 
							size="sm" 
							variant={actionButton.variant || 'secondary'}
							onclick={(e: any) => {
								e.stopPropagation();
								actionButton.onClick();
							}}
						>
							{actionButton.label}
						</Button>
					{/if}
					
					{#if showChevron}
						<div class="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center
									transition-all duration-200 group-hover:scale-110">
							<ChevronRight class="w-4 h-4 text-text-tertiary" />
						</div>
					{/if}
				</div>
			</button>
		{:else}
			<div class="w-full flex items-center p-2 gap-4 text-left relative z-10">
				<!-- Icon container with enhanced styling -->
				<div class="flex-shrink-0 relative">
					<div class="w-12 h-12 rounded-full {variantStyles().iconBg} flex items-center justify-center
								transition-all duration-200 group-hover:scale-110">
						<span class="text-2xl">{icon}</span>
					</div>
				</div>
				
				<!-- Content -->
				<div class="flex-1 min-w-0">
					<div class="font-semibold {variantStyles().titleColor} text-base mb-1">
						{title}
					</div>
					<div class="text-sm text-text-secondary leading-relaxed">
						{description}
					</div>
				</div>
				
				<!-- Action elements -->
				<div class="flex-shrink-0 flex items-center gap-2">
					{#if actionButton}
						<Button 
							size="sm" 
							variant={actionButton.variant || 'secondary'}
							on:click={(e) => {
								e.stopPropagation();
								actionButton.onClick();
							}}
						>
							{actionButton.label}
						</Button>
					{/if}
					
					{#if showChevron}
						<div class="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center
									transition-all duration-200 group-hover:scale-110">
							<ChevronRight class="w-4 h-4 text-text-tertiary" />
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
	
	<!-- Hover effect overlay -->
	<div class="absolute inset-0 bg-gradient-to-br {variantStyles().hoverOverlay} 
				rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
</div> 