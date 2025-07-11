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
	title="Tags"
	description="Manage your transaction tagging system"
	showBackButton={true}
	onBack={goBack}
/>

<SettingsSection title="Tag Categories">
	<SettingsCard
		icon="🏷️"
		title="What Tags"
		description="Configure categories for what you spend on"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="🎯"
		title="Why Tags"
		description="Set up motivation and purpose tags"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="📍"
		title="Where Tags"
		description="Manage location and merchant tags"
		onClick={() => {}}
	/>
</SettingsSection>

<SettingsSection title="Tag Management">
	<SettingsCard
		icon="⚡"
		title="Auto-Tagging"
		description="Set up automatic tag suggestions"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="🔄"
		title="Tag Merging"
		description="Combine similar tags"
		onClick={() => {}}
	/>
</SettingsSection> 