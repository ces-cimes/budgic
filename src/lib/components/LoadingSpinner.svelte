<script lang="ts">
	interface Props {
		message?: string;
		size?: 'sm' | 'md' | 'lg';
	}

	let { message = 'Loading...', size = 'md' }: Props = $props();

	const sizeClasses = {
		sm: 'h-6 w-6',
		md: 'h-8 w-8',
		lg: 'h-12 w-12'
	};
</script>

<div class="py-8 text-center">
	<div
		class="animate-spin rounded-full {sizeClasses[size]} border-text-secondary mx-auto border-b-2"
	></div>
	<p class="text-text-secondary mt-2">{message}</p>
</div>
