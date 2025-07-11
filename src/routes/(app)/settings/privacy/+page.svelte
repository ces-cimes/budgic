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
	title="Privacy"
	description="Manage your data and privacy settings"
	showBackButton={true}
	onBack={goBack}
/>

<SettingsSection title="Data Control">
	<SettingsCard
		icon="🔒"
		title="Data Encryption"
		description="Manage encryption settings"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="📤"
		title="Export Data"
		description="Download your personal data"
		onClick={() => {}}
	/>
</SettingsSection>

<SettingsSection title="Privacy Options">
	<SettingsCard
		icon="👁️"
		title="Analytics"
		description="Control usage analytics collection"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="🗑️"
		title="Delete Account"
		description="Permanently delete your account"
		onClick={() => {}}
		variant="destructive"
	/>
</SettingsSection>