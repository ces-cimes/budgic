<script lang="ts">
    interface Props {
        message?: string;
        size?: 'sm' | 'md' | 'lg';
    }

    let {
        message = 'Loading...',
        size = 'md'
    }: Props = $props();
	
	const sizeClasses = {
		sm: 'h-6 w-6',
		md: 'h-8 w-8',
		lg: 'h-12 w-12'
	};
</script>

<div class="text-center py-8">
	<div class="animate-spin rounded-full {sizeClasses[size]} border-b-2 border-text-secondary mx-auto"></div>
	<p class="text-text-secondary mt-2">{message}</p>
</div> 