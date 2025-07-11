<script lang="ts">
	interface Props {
		title: string;
		children: any;
	}

	let { title, children }: Props = $props();
</script>

<div class="mb-6">
	<h2 class="text-lg font-semibold mb-3 text-text-primary">{title}</h2>
	<div class="space-y-2">
		{@render children()}
	</div>
</div> 