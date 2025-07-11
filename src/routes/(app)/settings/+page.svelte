<script lang="ts">
	import { goto } from '$app/navigation';
	import SettingsCard from '$lib/components/layout/SettingsCard.svelte';
	import SettingsSection from '$lib/components/layout/SettingsSection.svelte';
    
	const settingsSections = [
		{
			group: 'Data & Import',
			sections: [
				{ id: 'account', label: 'Accounts & Import', icon: '🏦', description: 'Bank connections, CSV import, data export' },
				{ id: 'privacy', label: 'Privacy & Storage', icon: '🔒', description: 'Data retention, storage, sync options' },
			]
		},
		{
			group: 'Categorization',
			sections: [
				{ id: 'tags', label: 'Tags', icon: '🏷️', description: 'Manage what/why/where tags and custom dimensions' },
				{ id: 'rules', label: 'Auto-Categorization', icon: '🤖', description: 'Set up automatic transaction categorization rules' },
			]
		},
		{
			group: 'Budgeting',
			sections: [
				{ id: 'budget', label: 'Budget Settings', icon: '💰', description: 'Budget types, rollover, borrowing rules' },
				{ id: 'behavioral', label: 'Behavioral Features', icon: '🧠', description: 'Nudges, cooldowns, spending alerts' },
			]
		},
		{
			group: 'Display & Preferences',
			sections: [
				{ id: 'preferences', label: 'App Preferences', icon: '⚙️', description: 'Theme, currency, date formats, notifications' },
				{ id: 'advanced', label: 'Advanced Settings', icon: '🔧', description: 'Import presets, developer options, community features' },
			]
		}
	];

	function goToSection(id: string) {
		goto(`/settings/${id}`);
	}
</script>

{#each settingsSections as group}
	<SettingsSection title={group.group}>
		{#each group.sections as section}
			<SettingsCard
				icon={section.icon}
				title={section.label}
				description={section.description}
				onClick={() => goToSection(section.id)}
				showChevron={true}
			/>
		{/each}
	</SettingsSection>
{/each} 