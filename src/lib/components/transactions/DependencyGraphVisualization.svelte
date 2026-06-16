<script lang="ts">
	import { onMount } from 'svelte';
	import type { Transaction } from '$lib/core/db';
	import { db } from '$lib/core/db';
	import type { DependencyChain } from '$lib/core/services/core/dependency-tracking-service';
	import { dependencyTrackingService } from '$lib/core/services';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { AlertCircle, GitBranch, ZoomIn, ZoomOut } from '@lucide/svelte';

	interface Props {
		transactionId: string;
		className?: string;
	}

	const { transactionId, className = '' }: Props = $props();

	interface Node {
		id: string;
		transaction: Transaction;
		x: number;
		y: number;
		vx: number;
		vy: number;
		type: 'main' | 'dependency' | 'dependent';
		depth: number;
	}

	interface Edge {
		source: string;
		target: string;
		type: string;
	}

	let chain = $state<DependencyChain | null>(null);
	let nodes = $state<Node[]>([]);
	let edges = $state<Edge[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedNode = $state<string | null>(null);
	let scale = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let cycles = $state<string[][] | null>(null);

	const WIDTH = 800;
	const HEIGHT = 600;
	const NODE_RADIUS = 30;

	// Load dependency chain
	async function loadDependencyChain() {
		try {
			isLoading = true;
			error = null;

			chain = await dependencyTrackingService.getDependencyChain(transactionId);
			cycles = await dependencyTrackingService.detectCircularDependencies(transactionId);

			// Build nodes
			const nodeMap = new Map<string, Node>();

			// Add main transaction
			const mainTx = await db.transactions.get(transactionId);
			if (mainTx) {
				nodeMap.set(transactionId, {
					id: transactionId,
					transaction: mainTx,
					x: WIDTH / 2,
					y: HEIGHT / 2,
					vx: 0,
					vy: 0,
					type: 'main',
					depth: 0
				});
			}

			// Add dependencies
			for (const dep of chain.dependencies) {
				if (!nodeMap.has(dep.id)) {
					nodeMap.set(dep.id, {
						id: dep.id,
						transaction: dep.transaction,
						x: Math.random() * WIDTH,
						y: Math.random() * HEIGHT,
						vx: 0,
						vy: 0,
						type: 'dependency',
						depth: dep.depth
					});
				}
			}

			// Add dependents
			for (const dep of chain.dependents) {
				if (!nodeMap.has(dep.id)) {
					nodeMap.set(dep.id, {
						id: dep.id,
						transaction: dep.transaction,
						x: Math.random() * WIDTH,
						y: Math.random() * HEIGHT,
						vx: 0,
						vy: 0,
						type: 'dependent',
						depth: dep.depth
					});
				}
			}

			nodes = Array.from(nodeMap.values());

			// Build edges
			const edgeList: Edge[] = [];

			for (const dep of chain.dependencies) {
				edgeList.push({
					source: transactionId,
					target: dep.id,
					type: dep.type
				});
			}

			for (const dep of chain.dependents) {
				edgeList.push({
					source: dep.id,
					target: transactionId,
					type: dep.type
				});
			}

			edges = edgeList;

			// Run layout simulation
			simulateLayout();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load dependency chain';
		} finally {
			isLoading = false;
		}
	}

	// Simple force-directed layout simulation
	function simulateLayout() {
		const iterations = 100;
		const k = 50; // Optimal distance
		const c = 0.1; // Cooling factor

		for (let iter = 0; iter < iterations; iter++) {
			// Repulsive forces between all nodes
			for (let i = 0; i < nodes.length; i++) {
				for (let j = i + 1; j < nodes.length; j++) {
					const dx = nodes[j].x - nodes[i].x;
					const dy = nodes[j].y - nodes[i].y;
					const dist = Math.sqrt(dx * dx + dy * dy) || 1;
					const force = (k * k) / dist;

					const fx = (force * dx) / dist;
					const fy = (force * dy) / dist;

					nodes[i].vx -= fx;
					nodes[i].vy -= fy;
					nodes[j].vx += fx;
					nodes[j].vy += fy;
				}
			}

			// Attractive forces along edges
			for (const edge of edges) {
				const source = nodes.find((n) => n.id === edge.source);
				const target = nodes.find((n) => n.id === edge.target);

				if (source && target) {
					const dx = target.x - source.x;
					const dy = target.y - source.y;
					const dist = Math.sqrt(dx * dx + dy * dy) || 1;
					const force = dist / k;

					const fx = (force * dx) / dist;
					const fy = (force * dy) / dist;

					source.vx += fx * 0.5;
					source.vy += fy * 0.5;
					target.vx -= fx * 0.5;
					target.vy -= fy * 0.5;
				}
			}

			// Apply velocities
			for (const node of nodes) {
				node.x += node.vx * c;
				node.y += node.vy * c;

				// Keep nodes within bounds
				node.x = Math.max(NODE_RADIUS, Math.min(WIDTH - NODE_RADIUS, node.x));
				node.y = Math.max(NODE_RADIUS, Math.min(HEIGHT - NODE_RADIUS, node.y));

				// Damping
				node.vx *= 0.9;
				node.vy *= 0.9;
			}
		}
	}

	function getNodeColor(node: Node): string {
		if (node.type === 'main') return '#4A7C59';
		if (node.type === 'dependency') return '#3B82F6';
		return '#F59E0B';
	}

	function getEdgeColor(edge: Edge): string {
		const edgeColorMap: Record<string, string> = {
			required: '#EF4444',
			blocking: '#DC2626',
			sequential: '#7C3AED',
			suggested: '#10B981',
			conditional: '#F59E0B'
		};
		return edgeColorMap[edge.type] || '#6B7280';
	}

	function formatAmount(amount: number, currency: string): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency,
			minimumFractionDigits: 2
		}).format(Math.abs(amount));
	}

	function handleNodeClick(nodeId: string) {
		selectedNode = nodeId === selectedNode ? null : nodeId;
	}

	function zoomIn() {
		scale = Math.min(scale * 1.2, 3);
	}

	function zoomOut() {
		scale = Math.max(scale / 1.2, 0.5);
	}

	function resetView() {
		scale = 1;
		panX = 0;
		panY = 0;
	}

	onMount(() => {
		loadDependencyChain();
	});
</script>

<Card.Root class={className}>
	<Card.Header>
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<GitBranch class="text-primary h-5 w-5" />
				<Card.Title>Dependency Graph</Card.Title>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="outline" size="icon" onclick={zoomIn}>
					<ZoomIn class="h-4 w-4" />
				</Button>
				<Button variant="outline" size="icon" onclick={zoomOut}>
					<ZoomOut class="h-4 w-4" />
				</Button>
				<Button variant="outline" size="sm" onclick={resetView}>Reset</Button>
			</div>
		</div>
	</Card.Header>
	<Card.Content>
		{#if isLoading}
			<div class="flex h-96 items-center justify-center">
				<div class="text-muted-foreground">Loading dependency graph...</div>
			</div>
		{:else if error}
			<div class="flex h-96 items-center justify-center">
				<div class="text-destructive flex items-center gap-2">
					<AlertCircle class="h-5 w-5" />
					<span>{error}</span>
				</div>
			</div>
		{:else if chain}
			<!-- Statistics -->
			<div class="mb-4 grid grid-cols-3 gap-4">
				<div class="text-center">
					<div class="text-primary text-2xl font-bold">{chain.totalDependencies}</div>
					<div class="text-muted-foreground text-sm">Dependencies</div>
				</div>
				<div class="text-center">
					<div class="text-primary text-2xl font-bold">{chain.totalDependents}</div>
					<div class="text-muted-foreground text-sm">Dependents</div>
				</div>
				<div class="text-center">
					<div class="text-primary text-2xl font-bold">{chain.maxDepth}</div>
					<div class="text-muted-foreground text-sm">Max Depth</div>
				</div>
			</div>

			{#if cycles && cycles.length > 0}
				<div class="bg-destructive/10 border-destructive mb-4 rounded-md border p-4">
					<div class="text-destructive mb-2 flex items-center gap-2 font-medium">
						<AlertCircle class="h-5 w-5" />
						<span>Circular Dependencies Detected</span>
					</div>
					<div class="text-muted-foreground text-sm">
						Found {cycles.length} circular dependency cycle(s). This may prevent proper optimization.
					</div>
				</div>
			{/if}

			<!-- Graph Visualization -->
			<div class="bg-background overflow-hidden rounded-md border">
				<svg
					width={WIDTH}
					height={HEIGHT}
					viewBox="0 0 {WIDTH} {HEIGHT}"
					class="h-auto w-full"
				>
					<g transform="translate({panX}, {panY}) scale({scale})">
						<!-- Edges -->
						{#each edges as edge}
							{@const source = nodes.find((n) => n.id === edge.source)}
							{@const target = nodes.find((n) => n.id === edge.target)}
							{#if source && target}
								<g>
									<line
										x1={source.x}
										y1={source.y}
										x2={target.x}
										y2={target.y}
										stroke={getEdgeColor(edge)}
										stroke-width="2"
										marker-end="url(#arrowhead)"
										opacity="0.6"
									/>
								</g>
							{/if}
						{/each}

						<!-- Nodes -->
						{#each nodes as node}
							<g
								role="button"
								tabindex="0"
								class="cursor-pointer transition-all"
								onclick={() => handleNodeClick(node.id)}
								onkeydown={(e) => e.key === 'Enter' && handleNodeClick(node.id)}
							>
								<circle
									cx={node.x}
									cy={node.y}
									r={NODE_RADIUS}
									fill={getNodeColor(node)}
									stroke={selectedNode === node.id ? '#FFB347' : 'white'}
									stroke-width={selectedNode === node.id ? 3 : 2}
									opacity={selectedNode === null || selectedNode === node.id
										? 1
										: 0.5}
								/>
								<text
									x={node.x}
									y={node.y}
									text-anchor="middle"
									dominant-baseline="middle"
									fill="white"
									font-size="12"
									font-weight="bold"
								>
									{node.transaction.amount
										? formatAmount(
												node.transaction.amount,
												node.transaction.currency
											)
										: '—'}
								</text>
							</g>
						{/each}
					</g>

					<!-- Arrow marker -->
					<defs>
						<marker
							id="arrowhead"
							markerWidth="10"
							markerHeight="10"
							refX="9"
							refY="3"
							orient="auto"
							markerUnits="strokeWidth"
						>
							<path d="M0,0 L0,6 L9,3 z" fill="#6B7280" />
						</marker>
					</defs>
				</svg>
			</div>

			<!-- Legend -->
			<div class="mt-4 flex flex-wrap gap-4">
				<div class="flex items-center gap-2">
					<div class="h-4 w-4 rounded-full bg-[#4A7C59]"></div>
					<span class="text-muted-foreground text-sm">Main Transaction</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="h-4 w-4 rounded-full bg-[#3B82F6]"></div>
					<span class="text-muted-foreground text-sm">Dependencies</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="h-4 w-4 rounded-full bg-[#F59E0B]"></div>
					<span class="text-muted-foreground text-sm">Dependents</span>
				</div>
			</div>

			<!-- Selected Node Details -->
			{#if selectedNode}
				{@const node = nodes.find((n) => n.id === selectedNode)}
				{#if node}
					<div class="bg-muted mt-4 rounded-md p-4">
						<div class="mb-2 font-medium">
							{node.transaction.description || 'Untitled Transaction'}
						</div>
						<div class="grid grid-cols-2 gap-2 text-sm">
							<div>
								<span class="text-muted-foreground">Amount:</span>
								<span class="ml-2 font-medium">
									{formatAmount(
										node.transaction.amount || 0,
										node.transaction.currency
									)}
								</span>
							</div>
							<div>
								<span class="text-muted-foreground">Type:</span>
								<Badge variant="outline" class="ml-2">
									{node.type}
								</Badge>
							</div>
							<div>
								<span class="text-muted-foreground">Status:</span>
								<Badge variant="secondary" class="ml-2">
									{node.transaction.status}
								</Badge>
							</div>
							<div>
								<span class="text-muted-foreground">Depth:</span>
								<span class="ml-2 font-medium">{node.depth}</span>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
