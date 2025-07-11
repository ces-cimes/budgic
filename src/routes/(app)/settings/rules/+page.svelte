<script lang="ts">
    import { goto } from '$app/navigation';
    import TopBar from '$lib/components/layout/TopBar.svelte';
    import SettingsCard from '$lib/components/layout/SettingsCard.svelte';
    import SettingsSection from '$lib/components/layout/SettingsSection.svelte';

    function goBack() {
        goto('/settings');
    }
</script>

<TopBar 
	title="Rules"
	description="Configure automatic transaction processing"
	showBackButton={true}
	onBack={goBack}
/>

<SettingsSection title="Auto-Tagging Rules">
	<SettingsCard
		icon="🏷️"
		title="Merchant Rules"
		description="Auto-tag transactions by merchant name"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="💰"
		title="Amount Rules"
		description="Tag based on transaction amounts"
		onClick={() => {}}
	/>
</SettingsSection>

<SettingsSection title="Smart Rules">
	<SettingsCard
		icon="🧠"
		title="AI Suggestions"
		description="Learn from your tagging patterns"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="📊"
		title="Pattern Recognition"
		description="Auto-detect spending patterns"
		onClick={() => {}}
	/>
</SettingsSection> 