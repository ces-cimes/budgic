<script lang="ts">
	import Button from '$lib/components/primitives/Button.svelte';
	import { Plus, Trash2, Save, Play } from '@lucide/svelte';

	interface Scenario {
		id: string;
		name: string;
		description: string;
		changes: {
			category: string;
			amount: number;
			type: 'increase' | 'decrease';
		}[];
		impact: {
			totalChange: number;
			affectedCategories: string[];
			riskLevel: 'low' | 'medium' | 'high';
		};
		isActive: boolean;
	}

	const { scenarios = [], showPlaceholder = false, onScenarioSelect = () => {} } = $props<{
		scenarios?: Scenario[];
		showPlaceholder?: boolean;
		onScenarioSelect?: (scenario: Scenario) => void;
	}>();

	let showCreateModal = $state(false);
	let newScenario = $state({
		name: '',
		description: '',
		changes: []
	});

	// Placeholder scenarios
	const placeholderScenarios: Scenario[] = [
		{
			id: '1',
			name: 'Emergency Fund Boost',
			description: 'Increase emergency fund allocation by $200',
			changes: [
				{ category: 'Security', amount: 200, type: 'increase' },
				{ category: 'Lifestyle', amount: 200, type: 'decrease' }
			],
			impact: {
				totalChange: 0,
				affectedCategories: ['Security', 'Lifestyle'],
				riskLevel: 'low'
			},
			isActive: false
		},
		{
			id: '2',
			name: 'Investment Focus',
			description: 'Shift more money to growth investments',
			changes: [
				{ category: 'Growth', amount: 300, type: 'increase' },
				{ category: 'Lifestyle', amount: 200, type: 'decrease' },
				{ category: 'Survival', amount: 100, type: 'decrease' }
			],
			impact: {
				totalChange: 0,
				affectedCategories: ['Growth', 'Lifestyle', 'Survival'],
				riskLevel: 'medium'
			},
			isActive: false
		}
	];

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', { 
			style: 'currency', 
			currency: 'USD',
			minimumFractionDigits: 0
		}).format(amount);
	}

	const getRiskColor = (risk: string) => {
		switch (risk) {
			case 'low': return 'text-sage-green';
			case 'medium': return 'text-warning-amber';
			case 'high': return 'text-warm-coral';
			default: return 'text-text-secondary';
		}
	};

	const getRiskBgColor = (risk: string) => {
		switch (risk) {
			case 'low': return 'bg-sage-green/10 border-sage-green/20';
			case 'medium': return 'bg-warning-amber/10 border-warning-amber/20';
			case 'high': return 'bg-warm-coral/10 border-warm-coral/20';
			default: return 'bg-bg-tertiary border-primary/20';
		}
	};

	const handleCreateScenario = () => {
		// TODO: Implement scenario creation logic
		console.log('Creating scenario:', newScenario);
		showCreateModal = false;
		newScenario = { name: '', description: '', changes: [] };
	};

	const handleScenarioSelect = (scenario: Scenario) => {
		onScenarioSelect(scenario);
	};
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-xl font-semibold text-text-primary">Scenario Planning</h2>
			<p class="text-sm text-text-secondary">Model "what if" budget scenarios</p>
		</div>
		<Button 
			variant="primary" 
			size="sm"
			onclick={() => showCreateModal = true}
		>
			<Plus size={16} class="mr-2" />
			New Scenario
		</Button>
	</div>

	{#if showPlaceholder}
		<!-- Placeholder Scenarios -->
		<div class="space-y-3">
			{#each placeholderScenarios as scenario}
				<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
					<div class="flex items-start justify-between mb-3">
						<div class="flex-1">
							<h3 class="font-semibold text-text-primary mb-1">{scenario.name}</h3>
							<p class="text-sm text-text-secondary mb-2">{scenario.description}</p>
							
							<!-- Changes -->
							<div class="space-y-1 mb-3">
								{#each scenario.changes as change}
									<div class="flex items-center gap-2 text-sm">
										<span class="text-xs px-2 py-1 rounded-full bg-bg-tertiary">
											{change.category}
										</span>
										<span class="text-text-secondary">
											{change.type === 'increase' ? '+' : '-'}{formatCurrency(change.amount)}
										</span>
									</div>
								{/each}
							</div>
						</div>
						
						<!-- Risk Level -->
						<div class="text-right">
							<div class="text-xs px-2 py-1 rounded-full {getRiskBgColor(scenario.impact.riskLevel)} {getRiskColor(scenario.impact.riskLevel)}">
								{scenario.impact.riskLevel.toUpperCase()} RISK
							</div>
						</div>
					</div>
					
					<!-- Actions -->
					<div class="flex gap-2">
						<Button 
							variant="primary" 
							size="sm"
							onclick={() => handleScenarioSelect(scenario)}
						>
							<Play size={14} class="mr-1" />
							Apply
						</Button>
						<Button 
							variant="secondary" 
							size="sm"
						>
							<Save size={14} class="mr-1" />
							Save
						</Button>
						<Button 
							variant="secondary" 
							size="sm"
						>
							<Trash2 size={14} />
						</Button>
					</div>
				</div>
			{/each}
		</div>
		
		<!-- Placeholder Indicator -->
		<div class="p-3 bg-bg-tertiary rounded-lg border border-primary/20">
			<p class="text-xs text-text-secondary text-center italic">
				💡 Placeholder: Scenario planning logic not implemented
			</p>
		</div>
	{:else if scenarios.length > 0}
		<!-- Real Scenarios -->
		<div class="space-y-3">
			{#each scenarios as scenario}
				<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
					<div class="flex items-start justify-between mb-3">
						<div class="flex-1">
							<h3 class="font-semibold text-text-primary mb-1">{scenario.name}</h3>
							<p class="text-sm text-text-secondary mb-2">{scenario.description}</p>
							
							<!-- Changes -->
							<div class="space-y-1 mb-3">
								{#each scenario.changes as change}
									<div class="flex items-center gap-2 text-sm">
										<span class="text-xs px-2 py-1 rounded-full bg-bg-tertiary">
											{change.category}
										</span>
										<span class="text-text-secondary">
											{change.type === 'increase' ? '+' : '-'}{formatCurrency(change.amount)}
										</span>
									</div>
								{/each}
							</div>
						</div>
						
						<!-- Risk Level -->
						<div class="text-right">
							<div class="text-xs px-2 py-1 rounded-full {getRiskBgColor(scenario.impact.riskLevel)} {getRiskColor(scenario.impact.riskLevel)}">
								{scenario.impact.riskLevel.toUpperCase()} RISK
							</div>
						</div>
					</div>
					
					<!-- Actions -->
					<div class="flex gap-2">
						<Button 
							variant="primary" 
							size="sm"
							onclick={() => handleScenarioSelect(scenario)}
						>
							<Play size={14} class="mr-1" />
							Apply
						</Button>
						<Button 
							variant="secondary" 
							size="sm"
						>
							<Save size={14} class="mr-1" />
							Save
						</Button>
						<Button 
							variant="secondary" 
							size="sm"
						>
							<Trash2 size={14} />
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<!-- Empty State -->
		<div class="text-center py-8">
			<div class="text-4xl mb-4">📊</div>
			<h3 class="text-lg font-semibold text-text-primary mb-2">No scenarios yet</h3>
			<p class="text-text-secondary text-sm mb-4">
				Create your first budget scenario to see how changes affect your financial plan
			</p>
			<Button 
				variant="primary"
				onclick={() => showCreateModal = true}
			>
				<Plus size={16} class="mr-2" />
				Create Scenario
			</Button>
		</div>
	{/if}
</div>

<!-- Create Scenario Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-bg-secondary rounded-2xl p-6 w-full max-w-md border border-primary">
			<h3 class="text-lg font-semibold text-text-primary mb-4">Create New Scenario</h3>
			
			<div class="space-y-4">
				<div>
					<label class="block text-sm font-medium text-text-primary mb-2">Scenario Name</label>
					<input 
						type="text" 
						bind:value={newScenario.name}
						class="w-full p-3 bg-bg-tertiary border border-primary rounded-lg text-text-primary"
						placeholder="e.g., Emergency Fund Boost"
					/>
				</div>
				
				<div>
					<label class="block text-sm font-medium text-text-primary mb-2">Description</label>
					<textarea 
						bind:value={newScenario.description}
						class="w-full p-3 bg-bg-tertiary border border-primary rounded-lg text-text-primary"
						rows="3"
						placeholder="Describe what this scenario models..."
					></textarea>
				</div>
			</div>
			
			<div class="flex gap-2 mt-6">
				<Button 
					variant="secondary"
					onclick={() => showCreateModal = false}
				>
					Cancel
				</Button>
				<Button 
					variant="primary"
					onclick={handleCreateScenario}
				>
					Create
				</Button>
			</div>
		</div>
	</div>
{/if} 