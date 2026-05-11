<script lang="ts">
	import Header from '$lib/components/Header.svelte';
	import { PageLayout } from '$lib/components/layouts';
	import { CalcKeypad } from '$lib/components/ui/calculator/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';

	let expression = $state('');

	function onKeypadConfirm(value: number) {
		expression = String(value);
	}

	function clearAll() {
		expression = '';
	}
</script>

<PageLayout>
	{#snippet topBar()}
		<Header title="Calculator" showBackButton={true} backButtonLink="/" backButtonLabel="Home" />
	{/snippet}

	<div class="mx-auto max-w-md space-y-4 px-4 py-6">
		<p class="text-muted-foreground text-sm">
			Enter amounts with + − × ÷ and parentheses. Result updates as you tap; press = to commit.
		</p>
		<div class="flex gap-2">
			<Button type="button" variant="outline" size="sm" onclick={clearAll}>Clear</Button>
		</div>
		<CalcKeypad bind:expression embedDrawer={false} onConfirm={onKeypadConfirm} />
	</div>
</PageLayout>
