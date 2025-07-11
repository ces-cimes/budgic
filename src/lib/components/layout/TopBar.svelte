<script lang="ts">
    import { ChevronLeft } from '@lucide/svelte';
    import { onMount } from 'svelte';
    
    interface Props {
        title?: string;
        description?: string;
        showBackButton?: boolean;
        onBack?: () => void;
        children?: any;
    }
    
    let { 
        title = '', 
        description = '', 
        showBackButton = false, 
        onBack = () => window.history.back(),
        children = null 
    }: Props = $props();

    let headerElement: HTMLElement | null = $state(null);
    let topBarHeight = $state(0);

    // Function to update height
    const updateHeight = () => {
        if (headerElement) {
            const newHeight = headerElement.offsetHeight;
            if (newHeight !== topBarHeight) {
                topBarHeight = newHeight;
            }
        }
    };

    onMount(() => {
        updateHeight();
        
        // Set up ResizeObserver to watch for size changes
        const resizeObserver = new ResizeObserver(() => {
            updateHeight();
        });
        
        if (headerElement) {
            resizeObserver.observe(headerElement);
        }

        // Also update height after a short delay to catch any async content
        setTimeout(updateHeight, 100);
        setTimeout(updateHeight, 500);

        return () => {
            resizeObserver.disconnect();
        };
    });

    // Update height when children change
    $effect(() => {
        if (children) {
            // Wait for next tick to allow children to render
            setTimeout(updateHeight, 0);
            setTimeout(updateHeight, 100);
        }
    });
</script>

<header 
    bind:this={headerElement}
    class="fixed top-0 left-0 right-0 z-50 from-bg-primary/60 to-bg-primary bg-gradient-to-t backdrop-blur-sm border-b border-primary text-shadow-lg"
>
    <div class="px-4 py-3">
        <div class='{children ? 'border-b border-bg-surface/70 pb-2 mb-2' : ''}'>
            <div class="flex items-center gap-2">
                {#if showBackButton}
                    <button 
                        on:click={onBack}
                        class="p-1 rounded-lg hover:bg-bg-secondary/50 transition-colors"
                        aria-label="Go back"
                    >
                        <ChevronLeft class="w-5 h-5" />
                    </button>
                {/if}
                {#if title}
                    <h1 class="text-xl font-bold">{title}</h1>
                {/if}
            </div>
            {#if description}
                <p class="text-sm text-text-secondary">{description}</p>
            {/if}
        </div>
        {#if children}
            <div>
                {@render children()}
            </div>
        {/if}
    </div>
</header>

<!-- Dynamic spacer to push content below the fixed TopBar -->
<div style="height: {topBarHeight}px; min-height: 60px;"></div>