<script lang="ts">
	import type { ReportsTabProps } from '../types.js';
	import { ActionButton } from '$lib/components/shared';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { FileText, Download, BarChart3, PieChart, TrendingUp } from '@lucide/svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

	interface Props extends ReportsTabProps {
		children?: any;
	}

	const {
		recentReports,
		onGenerateReport,
		onDownloadReport,
		settings,
		onUpdateSettings,
		isLoading = false,
		children
	}: Props = $props();

	function formatTimestamp(timestamp: string) {
		const now = new Date();
		const reportTime = new Date(timestamp);
		const diff = now.getTime() - reportTime.getTime();
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (days === 0) return 'Today';
		if (days === 1) return 'Yesterday';
		if (days < 7) return `${days} days ago`;
		if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
		return `${Math.floor(days / 30)} months ago`;
	}

	function getReportIcon(type: ReportsTabProps['recentReports'][0]['type']) {
		switch (type) {
			case 'monthly':
				return FileText;
			case 'spending':
				return BarChart3;
			case 'category':
				return PieChart;
			case 'trend':
				return TrendingUp;
			default:
				return FileText;
		}
	}
</script>

{#if isLoading}
	<div class="space-y-6 py-2 sm:py-4">
		<Skeleton class="h-56 w-full rounded-xl" />

		<div class="space-y-3">
			<Skeleton class="h-6 w-36" />
			<Skeleton class="h-14 w-full rounded-lg" />
			<Skeleton class="h-14 w-full rounded-lg" />
			<Skeleton class="h-14 w-full rounded-lg" />
		</div>

		<Skeleton class="h-52 w-full rounded-xl" />
	</div>
{:else}
	<div class="space-y-6 py-2 sm:py-4">
		<!-- Report Generation -->
		<Card.Root class="p-6">
			<div class="mb-4 flex items-center gap-4">
				<div class="bg-accent flex h-10 w-10 items-center justify-center rounded-lg">
					<FileText class="text-primary h-5 w-5" />
				</div>
				<div>
					<h3 class="text-primary text-lg font-semibold">Generate Report</h3>
					<p class="text-muted-foreground text-sm">Create detailed financial reports</p>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<ActionButton
					icon={Download}
					label="Monthly Summary"
					subtitle="PDF Export"
					onClick={() => onGenerateReport('monthly')}
				/>

				<ActionButton
					icon={BarChart3}
					label="Spending Analysis"
					subtitle="Detailed Charts"
					onClick={() => onGenerateReport('spending')}
				/>

				<ActionButton
					icon={PieChart}
					label="Category Report"
					subtitle="Breakdown by Category"
					onClick={() => onGenerateReport('category')}
				/>

				<ActionButton
					icon={TrendingUp}
					label="Trend Report"
					subtitle="Historical Analysis"
					onClick={() => onGenerateReport('trend')}
				/>
			</div>
		</Card.Root>

		<!-- Recent Reports -->
		<Card.Root class="p-6">
			<h3 class="text-primary mb-4 text-lg font-semibold">Recent Reports</h3>
			<div class="space-y-3">
				{#each recentReports as report (report.id)}
					{@const ReportIcon = getReportIcon(report.type)}
					<div class="bg-muted/50 flex items-center justify-between rounded-lg p-3">
						<div class="flex items-center gap-3">
							<ReportIcon class="text-primary h-4 w-4" />
							<div>
								<div class="text-primary text-sm font-medium">{report.title}</div>
								<div class="text-muted-foreground text-xs">
									{formatTimestamp(report.generatedAt)}
								</div>
							</div>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => onDownloadReport(report.id)}
						>
							<Download class="h-4 w-4" />
						</Button>
					</div>
				{/each}
			</div>
		</Card.Root>

		<!-- Report Settings -->
		<Card.Root class="p-6">
			<h3 class="text-primary mb-4 text-lg font-semibold">Report Settings</h3>
			<div class="space-y-4">
				<div class="flex items-center justify-between">
					<div>
						<div class="text-primary text-sm font-medium">
							Auto-generate monthly reports
						</div>
						<div class="text-muted-foreground text-xs">
							Generate reports automatically at month end
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={() => onUpdateSettings({ autoGenerate: !settings.autoGenerate })}
					>
						{settings.autoGenerate ? 'Disable' : 'Enable'}
					</Button>
				</div>

				<div class="flex items-center justify-between">
					<div>
						<div class="text-primary text-sm font-medium">Email reports</div>
						<div class="text-muted-foreground text-xs">Send reports to your email</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={() => onUpdateSettings({ emailReports: !settings.emailReports })}
					>
						{settings.emailReports ? 'Disable' : 'Configure'}
					</Button>
				</div>

				<div class="flex items-center justify-between">
					<div>
						<div class="text-primary text-sm font-medium">Report format</div>
						<div class="text-muted-foreground text-xs">
							Choose default export format
						</div>
					</div>
					<Button variant="outline" size="sm">
						{settings.defaultFormat}
					</Button>
				</div>
			</div>
		</Card.Root>

		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
