<script lang="ts">
	import { 
		TrendingUp, 
		TrendingDown, 
		DollarSign, 
		Calendar, 
		Target, 
		AlertTriangle, 
		CheckCircle, 
		Info, 
		Bell,
		Zap,
		Award,
		ChartBar,
		Lightbulb,
		Clock,
		Filter,
		X,
		CircleAlert
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { 
		enhancedBudgetService, 
		insightsService, 
		analyticsCoreService,
		userActionsService,
		settingsService
	} from '$lib/core/services';
	import { Progress } from '$lib/components/ui/progress/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import * as Tabs from '$lib/components/ui/tabs/index.ts';
	import TabNavigation from '$lib/components/TabNavigation.svelte';
	import BreadcrumbNav from '$lib/components/BreadcrumbNav.svelte';
	import InsightsDisplay from '$lib/components/InsightsDisplay.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';
	import { PageLayout, MobileNavigation } from '$lib/components/layouts';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';

	const { data } = $props<{ data: any }>();

	// State for insights and data
	let healthScore = $state<any>(null);
	let contextualSuggestions = $state<any[]>([]);
	let isLoading = $state(true);
	let activeTab = $state<'overview' | 'insights'>('overview');
	let userCurrency = $state<string>('USD'); // Default to USD

	// Sidebar context for mobile detection
	const sidebar = Sidebar.useSidebar();

	// Tab navigation configuration
	const insightsTabs = [
		{ id: 'overview', label: 'Overview', path: '/insights', icon: ChartBar },
		{ id: 'notifications', label: 'Notifications', path: '/insights/notifications', icon: Bell },
		{ id: 'achievements', label: 'Achievements', path: '/insights/achievements', icon: Award },
		{ id: 'trends', label: 'Trends', path: '/insights/trends', icon: TrendingUp },
		{ id: 'recommendations', label: 'Recommendations', path: '/insights/recommendations', icon: Lightbulb }
	];

	onMount(async () => {
		try {
			// Load user currency preference first
			userCurrency = await settingsService.getCurrency();
			
			await loadAllData();
			// Track that user viewed the notification center
			await userActionsService.track('progress_viewed', {
				triggeredBy: 'user_initiated',
				categoriesViewed: ['notifications', 'insights', 'alerts'],
				actionTaken: 'none'
			});
		} catch (error) {
			console.error('Error loading notification center data:', error);
		} finally {
			isLoading = false;
		}
	});

	async function loadAllData() {
		const [
			suggestionsData,
			healthData
		] = await Promise.all([
			enhancedBudgetService.generateContextualSuggestions('default'),
			analyticsCoreService.calculateFinancialHealthScore() // Works with all accounts when no accountId provided
		]);

		healthScore = healthData;
		contextualSuggestions = suggestionsData;
	}

	function getSeverityColor(severity: string) {
		switch (severity) {
			case 'alert': return 'bg-destructive/10 text-destructive border-destructive/20';
			case 'warning': return 'bg-warning/10 text-warning border-warning/20';
			case 'success': return 'bg-golden-amber/10 text-golden-amber border-accent/20';
			case 'info': return 'bg-info/10 text-info border-info/20';
			default: return 'bg-muted text-muted-foreground border-border';
		}
	}

	function getSeverityIcon(severity: string) {
		switch (severity) {
			case 'alert': return AlertTriangle;
			case 'warning': return AlertTriangle;
			case 'success': return CheckCircle;
			case 'info': return Info;
			default: return Info;
		}
	}

	function getPriorityColor(priority: string) {
		switch (priority) {
			case 'urgent': return 'bg-destructive text-destructive-foreground';
			case 'high': return 'bg-warning text-warning-foreground';
			case 'medium': return 'bg-info text-info-foreground';
			case 'low': return 'bg-muted text-muted-foreground';
			default: return 'bg-muted text-muted-foreground';
		}
	}

	function getHealthGradeColor(grade: string) {
		switch (grade) {
			case 'A': return 'text-[var(--color-success)]';
			case 'B': return 'text-[var(--color-info)]';
			case 'C': return 'text-[var(--color-warning)]';
			case 'D': return 'text-[var(--color-warning)]';
			case 'F': return 'text-[var(--color-destructive)]';
			default: return 'text-muted-foreground';
		}
	}

	function formatCurrency(amount: number) {
		return formatMainCurrencyAmount(amount, userCurrency);
	}

	function getInsightsCount() {
		return insightsService.getInsights().length;
	}
</script>

<svelte:head>
	<title>Notification Center | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet bottomBar()}
		<!-- Mobile Navigation -->
		{#if sidebar.isMobile}
			<MobileNavigation />
		{/if}
	{/snippet}

	<div class="container mx-auto px-4 py-6 max-w-6xl">
	<!-- Header -->
	<header class="mb-8">
		<div class="flex flex-col mb-4 w-full">
			<div class="flex justify-between items-center space-x-2">
				<h1 class="text-3xl font-bold text-primary mb-2">Insights Center</h1>
				<Badge variant="secondary">
					<CircleAlert size={14} />
					<span>{insightsService.getInsightsBySeverity('alert').length} alerts</span>
				</Badge>
			</div>
			<p class="text-muted-foreground">Stay informed about your financial health and opportunities</p>
		</div>

		<!-- Tabs -->
		<Tabs.Root value={activeTab} onValueChange={(value) => activeTab = value as typeof activeTab}>
			<Tabs.List class="w-full">
				<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
				<Tabs.Trigger value="insights" class="flex items-center">
					<span>Insights</span>
					<Badge variant="outline">
						{getInsightsCount()}
					</Badge>
				</Tabs.Trigger>
			</Tabs.List>
			
			<Tabs.Content value="overview" class="mt-6">
				{#if isLoading}
					<LoadingSpinner message="Loading financial health data..." size="md" />
				{:else}
					<!-- Financial Health Score -->
					{#if healthScore}
						<section class="mb-8">
							<Card.Root>
								<Card.Header>
									<Card.Title>
										<div class="flex items-center space-x-2">
											<ChartBar size={20} />
											<span>Financial Health</span>
										</div>
									</Card.Title>
									<Card.Description>Your overall financial wellness assessment</Card.Description>
								</Card.Header>
								<Card.Content>
									<div class="flex items-center justify-between">
										<div class="flex items-center space-x-4">
											<div class="text-center">
												<div class="text-4xl font-bold {getHealthGradeColor(healthScore.grade)}">
													{healthScore.grade}
												</div>
												<div class="text-sm text-muted-foreground">{healthScore.level}</div>
											</div>
											<div>
												<div class="text-2xl font-bold text-primary">{healthScore.overallScore}/100</div>
												<div class="text-sm text-muted-foreground">{healthScore.title}</div>
											</div>
										</div>
										<div class="text-right">
											<div class="text-sm text-muted-foreground">Trend</div>
											<div class="flex items-center space-x-1">
												{#if healthScore.trend === 'improving'}
													<TrendingUp size={16} class="text-success" />
													<span class="text-success">+{healthScore.trendValue}%</span>
												{:else if healthScore.trend === 'declining'}
													<TrendingDown size={16} class="text-destructive" />
													<span class="text-destructive">{healthScore.trendValue}%</span>
												{:else}
													<span class="text-muted-foreground">Stable</span>
												{/if}
											</div>
										</div>
									</div>
								</Card.Content>
							</Card.Root>
						</section>
					{/if}
				{/if}
			</Tabs.Content>

			<Tabs.Content value="insights" class="mt-6">
				{#if isLoading}
					<LoadingSpinner message="Loading insights..." size="md" />
				{:else}
					<!-- Insights Display -->
					<section class="mb-8">
						<h2 class="text-xl font-semibold text-primary mb-4 flex items-center space-x-2">
							<Lightbulb size={20} />
							<span>Financial Insights</span>
						</h2>
						
						<InsightsDisplay 
							maxInsights={10} 
							showDismiss={true}
						/>
					</section>
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	</header>

	<!-- Tab Navigation -->
	<TabNavigation tabs={insightsTabs} />

	<!-- Breadcrumb Navigation (Desktop only) -->
	{#if !sidebar.isMobile}
		<BreadcrumbNav />
	{/if}

	</div>
</PageLayout> 