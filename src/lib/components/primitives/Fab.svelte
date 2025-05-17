<!-- src/lib/components/ui/Fab.svelte -->
<script lang="ts">
    import Button from './Button.svelte';

    type Variant = 'primary' | 'secondary' | 'neutral' | 'danger';
    type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    type FabSize = 'sm' | 'md' | 'lg';

    let {
        variant = 'primary' as Variant,
        size = 'md' as FabSize,
        position = 'bottom-right' as Position,
        children = $bindable(),
        class: className = '',
        ...rest
    } = $props();

    // Position classes with proper typing
    const positionMap = {
        'top-left': 'top-4 left-4',
        'top-right': 'top-4 right-4',
        'bottom-left': 'bottom-24 left-4',
        'bottom-right': 'bottom-24 right-4',
        'center': 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
    } as const;

    // Size dimensions with proper typing
    const sizeMap = {
        sm: 'w-10 h-10',
        md: 'w-14 h-14',
        lg: 'w-20 h-20'
    } as const;

    // Derived values
    const positionClasses = $derived(positionMap[position]);
    const sizeDimensions = $derived(sizeMap[size]);
    const classes = $derived([
        '!p-0 flex items-center justify-center',
        'shadow-lg hover:shadow-xl transition-all',
        'fixed z-50',
        sizeDimensions,
        className
    ].join(' '));
</script>

<div class="fixed {positionClasses} {sizeDimensions}">
    <Button
        variant={variant}
        size={size}
        class={classes}
        {...rest}
    >
        {#if children}
            <span class="flex items-center justify-center">
                {@render children()}
            </span>
        {/if}
    </Button>
</div>