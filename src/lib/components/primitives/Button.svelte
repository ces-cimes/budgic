<!-- src/lib/components/ui/Button.svelte -->
<script lang="ts">
    type Variant = 'primary' | 'secondary' | 'neutral' | 'danger';
    type Size = 'sm' | 'md' | 'lg';
    type ButtonType = 'button' | 'submit' | 'reset';

    let {
        variant = 'primary' as Variant,
        size = 'md' as Size,
        disabled = false,
        type: typeProp = 'button' as ButtonType,
        fullWidth = false,
        children = $bindable(),
        element = $bindable<HTMLButtonElement>(),
        class: className = '',
        ...rest
    } = $props();

    // Variant classes with proper typing - updated for Warm Midnight
    const variantMap = {
        primary: 'bg-golden-amber text-warm-charcoal hover:bg-golden-amber/90',
        secondary: 'bg-bg-tertiary text-text-primary hover:bg-bg-surface',
        neutral: 'bg-bg-secondary text-text-primary border border-primary hover:bg-bg-tertiary',
        danger: 'bg-warm-coral text-warm-ivory hover:bg-warm-coral/90'
    } as const;

    // Size classes with proper typing
    const sizeMap = {
        sm: 'text-sm px-3 py-2',
        md: 'text-base px-4 py-3',
        lg: 'text-lg px-6 py-4'
    } as const;

    // Derived classes
    const variantClasses = $derived(variantMap[variant]);
    const sizeClasses = $derived(sizeMap[size]);
    const classes = $derived([
        'rounded-xl inline-flex items-center justify-center',
        'font-medium leading-none shadow hover:opacity-90',
        'transition-colors duration-200 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-golden-amber',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses,
        sizeClasses,
        fullWidth ? 'w-full' : '',
        className
    ].join(' '));
</script>

<button
    type={typeProp}
    disabled={disabled}
    class={classes}
    bind:this={element}
    {...rest}
>
    {#if children}
        <span class="contents">
            {@render children()}
        </span>
    {/if}
</button>