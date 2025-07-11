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
	title="Behavioral"
	description="Configure smart nudges and insights"
	showBackButton={true}
	onBack={goBack}
/>

<SettingsSection title="Smart Nudges">
	<SettingsCard
		icon="🧠"
		title="Spending Momentum"
		description="Get warned about rapid spending patterns"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="🎯"
		title="Goal Reminders"
		description="Stay on track with your financial goals"
		onClick={() => {}}
	/>
</SettingsSection>

<SettingsSection title="Insights">
	<SettingsCard
		icon="💡"
		title="Daily Insights"
		description="Get personalized financial insights"
		onClick={() => {}}
	/>
	
	<SettingsCard
		icon="📊"
		title="Pattern Recognition"
		description="Learn about your spending patterns"
		onClick={() => {}}
	/>
</SettingsSection> 