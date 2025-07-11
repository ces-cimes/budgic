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
	title="Preferences"
	description="Customize your Budgic experience"
	showBackButton={true}
	onBack={goBack}
/>

<SettingsSection title="Display">
	<SettingsCard
		icon="🎨"
		title="Theme"
		description="Choose light, dark, or auto theme"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="📱"
		title="Currency"
		description="Set your preferred currency"
		onClick={() => {}}
	/>
</SettingsSection>

<SettingsSection title="Notifications">
	<SettingsCard
		icon="🔔"
		title="Push Notifications"
		description="Configure notification preferences"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="📧"
		title="Email Alerts"
		description="Set up email notifications"
		onClick={() => {}}
	/>
</SettingsSection> 