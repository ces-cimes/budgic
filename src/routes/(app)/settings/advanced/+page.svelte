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
	title="Advanced"
	description="Advanced settings and developer options"
	showBackButton={true}
	onBack={goBack}
/>

<SettingsSection title="Developer Options">
	<SettingsCard
		icon="🐛"
		title="Debug Mode"
		description="Enable debug logging and features"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="🔄"
		title="Reset App"
		description="Reset all settings to defaults"
		onClick={() => {}}
		variant="destructive"
	/>
</SettingsSection>

<SettingsSection title="System">
	<SettingsCard
		icon="💾"
		title="Storage Info"
		description="View database and storage details"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="📊"
		title="Performance"
		description="Monitor app performance metrics"
		onClick={() => {}}
	/>
</SettingsSection> 