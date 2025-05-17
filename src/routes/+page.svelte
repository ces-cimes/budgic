<script lang="ts">
	import { onMount } from 'svelte';
	import { tapOutside } from 'svelte-outside';

	import { formatNumberShort } from '$lib/utils/utils';

    import { stores } from '$lib/stores.svelte';

	import TransactionList from '$lib/components/TransactionList.svelte';
	import Card from '$lib/components/primitives/Card.svelte';
	import Button from '$lib/components/primitives/Button.svelte';

    let balances = $state({
        income: 0,
        savings: 0,
        expenses: 0
    });
    let error: string | null = null;
	
	let loading = $state(true);

	let currentMonth = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	let expenses = 200000;
    let income = 130000;
    let savings = 20000;

	// Tooltip logic
    let showTooltip = $state(false);
    let tooltipContent = $state('');
    let tooltipPosition = $state({ x: 0, y: 0 });
    let activeButton: HTMLButtonElement | null = null;
    
    function showNumberTooltip(event: MouseEvent | TouchEvent, fullNumber: number) {
        tooltipContent = fullNumber.toLocaleString();
        tooltipPosition = { 
            x: 'clientX' in event ? event.clientX : event.touches[0].clientX,
            y: 'clientY' in event ? event.clientY : event.touches[0].clientY
        };
        showTooltip = true;
    }
    
    function showTooltipFromKeyboard(event: FocusEvent, fullNumber: number) {
        const element = event.currentTarget as HTMLButtonElement;
        const rect = element.getBoundingClientRect();
        tooltipContent = fullNumber.toLocaleString();
        tooltipPosition = {
            x: rect.left + rect.width / 2,
            y: rect.bottom
        };
        showTooltip = true;
        activeButton = element;
    }
    
    function hideTooltip() {
        showTooltip = false;
        activeButton = null;
    }

    onMount (async () => {
        try {
            loading = true;
            balances = await stores.balances.getBalancesByType();
        } catch (err) {
            error = err instanceof Error ? err.message : "Failed to load balances";
        } finally {
            loading = false;
        }
    });

    // Function to refresh balances
    async function refreshBalances() {
        try {
            loading = true;
            balances = await stores.balances.getBalancesByType(true); // true forces fresh data
        } catch (err) {
            error = err instanceof Error ? err.message : "Failed to refresh balances";
        } finally {
            loading = false;
        }
    }

    // Format currency for display
    function formatCurrency(amount: number): string {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
        }).format(amount);
    }
</script>

<!-- Top Bar - Month Picker -->
<Card class="mb-4 flex justify-between items-center" title='Dashboard'>
	<h1 class="text-2xl font-semibold">Dashboard</h1>
    <div class="flex items-center gap-2">
        <Button size="sm" variant="ghost">◄</Button>
        <span class="font-medium whitespace-nowrap">{currentMonth}</span>
        <Button size="sm" variant="ghost">►</Button>
    </div>
</Card>

<!-- Summary Cards -->
<div class="grid grid-cols-3 gap-2 mb-4">
    <Card class="text-center text-sm text-gray-500 flex flex-col justify-between" padding='p-4'>
		<div>💸</div>
        <div class="whitespace-nowrap inline-flex justify-center"> Expenses</div>
        <button 
            class="text-lg font-bold text-expense cursor-help w-full bg-transparent border-none p-0 whitespace-nowrap inline-flex justify-center"
            onmouseenter={(e) => showNumberTooltip(e, expenses)}
            onmouseleave={hideTooltip}
            onfocus={(e) => showTooltipFromKeyboard(e, expenses)}
            onblur={hideTooltip}
            ontouchstart={(e) => showNumberTooltip(e, expenses)}
            ontouchend={hideTooltip}
            use:tapOutside={hideTooltip}
            aria-label={`Show full expenses amount: ${expenses.toLocaleString()}`}
        >
            -{balances.expenses}
        </button>
    </Card>
    
    <Card class="text-center text-sm text-gray-500 flex flex-col justify-between" padding='p-4'>
        <div>💰</div>
		<div class=" whitespace-nowrap inline-flex justify-center">Income</div>
        <button 
            class="text-lg font-bold text-income cursor-help w-full bg-transparent border-none p-0 whitespace-nowrap inline-flex justify-center"
            onmouseenter={(e) => showNumberTooltip(e, income)}
            onmouseleave={hideTooltip}
            onfocus={(e) => showTooltipFromKeyboard(e, income)}
            onblur={hideTooltip}
            ontouchstart={(e) => showNumberTooltip(e, income)}
            ontouchend={hideTooltip}
            use:tapOutside={hideTooltip}
            aria-label={`Show full income amount: ${income.toLocaleString()}`}
        >
            +{balances.income}
        </button>
    </Card>
    
    <Card class="text-center text-sm text-gray-500 flex flex-col justify-between" padding='p-4'>
        <div>💾</div>
		<div class="whitespace-nowrap inline-flex justify-center">Savings</div>
        <button 
            class="text-lg font-bold text-savings cursor-help w-full bg-transparent border-none p-0 whitespace-nowrap inline-flex justify-center"
            onmouseenter={(e) => showNumberTooltip(e, savings)}
            onmouseleave={hideTooltip}
            onfocus={(e) => showTooltipFromKeyboard(e, savings)}
            onblur={hideTooltip}
            ontouchstart={(e) => showNumberTooltip(e, savings)}
            ontouchend={hideTooltip}
            use:tapOutside={hideTooltip}
            aria-label={`Show full savings amount: ${savings.toLocaleString()}`}
        >
            +{balances.savings}
        </button>
    </Card>
</div>

{#if showTooltip}
    <div 
        class="tooltip fixed bg-gray-800 text-white text-sm px-2 py-1 rounded pointer-events-none z-50"
        style={`left: ${tooltipPosition.x}px; top: ${tooltipPosition.y + 20}px`}
    >
        {tooltipContent}
    </div>
{/if}

<!-- Budget Health Card -->
<Card class="mb-4 p-4">
    <h2 class="text-lg font-semibold mb-2">Budget health</h2>
    <div class="w-full bg-gray-200 rounded-full h-4">
        <div class="bg-green-500 h-4 rounded-full" style="width: 100%"></div>
    </div>
    <div class="text-right mt-1 text-sm font-medium">100%</div>
	<div class="relative h-16 w-full">
		
	</div>
</Card>

<!-- Upcoming Transactions -->
<Card class="mb-4">
    <h2 class="text-xl font-semibold mb-2">📆 Upcoming this week</h2>
    <TransactionList filterName='future'/>
</Card>

<!-- Load More Button -->
<div class="flex justify-center mb-4">
    <Button variant="outline">Load More</Button>
</div>