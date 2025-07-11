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
	title="Account"
	description="Manage your bank connections and data"
	showBackButton={true}
	onBack={goBack}
/>

<SettingsSection title="Bank Connections">
	<SettingsCard
		icon="🔗"
		title="Connect Bank Account"
		description="Securely link your bank for automatic imports"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="📥"
		title="Import CSV"
		description="Upload transaction data from your bank"
		onClick={() => {}}
	/>
</SettingsSection>

<SettingsSection title="Import Presets">
	<SettingsCard
		icon="⚙️"
		title="My Bank Format"
		description="Custom import format for your bank"
		actionButton={{
			label: "Edit",
			variant: "secondary",
			onClick: () => {}
		}}
	/>
	
	<SettingsCard
		icon="👥"
		title="Community Preset"
		description="Pre-configured format from community"
		actionButton={{
			label: "Use",
			variant: "secondary",
			onClick: () => {}
		}}
	/>
</SettingsSection>

<SettingsSection title="Data Export">
	<SettingsCard
		icon="📤"
		title="Full Backup"
		description="Export all your data and settings"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="📊"
		title="Filtered Export"
		description="Export specific data with filters"
		onClick={() => {}}
	/>
</SettingsSection> 