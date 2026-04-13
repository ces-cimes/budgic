<script lang="ts" module>
	import { getContext, setContext } from 'svelte';
	import type { ToggleVariants } from '$lib/components/ui/toggle/index.js';
	export function setToggleGroupCtx(props: ToggleVariants) {
		setContext('toggleGroup', props);
	}

	export function getToggleGroupCtx(): ToggleVariants | undefined {
		return getContext<ToggleVariants | undefined>('toggleGroup');
	}
</script>

<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		size = 'default',
		variant = 'default',
		children,
		...restProps
	}: ToggleGroupPrimitive.RootProps & ToggleVariants = $props();

	// Context must be set synchronously during Root init. Child Items mount during this
	// component's render; `$effect` runs too late and `getToggleGroupCtx()` was undefined.
	// Getters keep reads aligned with current props without copying into `$state` once.
	setToggleGroupCtx({
		get variant() {
			return variant;
		},
		get size() {
			return size;
		}
	});
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<ToggleGroupPrimitive.Root
	bind:value={value as never}
	bind:ref
	data-slot="toggle-group"
	data-variant={variant}
	data-size={size}
	class={cn(
		'group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</ToggleGroupPrimitive.Root>
