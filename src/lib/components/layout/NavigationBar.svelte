<script lang="ts">
    import { page } from '$app/state';
    import { LayoutDashboard, ListMinus, PiggyBank, FileText, Sliders  } from '@lucide/svelte';
</script>

<nav class="z-50 rounded-t-xl fixed bottom-0 left-0 right-0 bg-zinc-800 p-2 flex justify-between sm:justify-center">
    <div class="flex w-full justify-evenly md:gap-8">
        <a href="/" class="flex flex-col items-center p-2 flex-1 max-w-[20%] rounded-lg hover:bg-zinc-700 transition-all duration-100 {page.url.pathname === '/' ? 'text-[var(--accent)]' : ''}">
            <LayoutDashboard class="size-8"/>
            <p class="text-xs whitespace-nowrap">Home</p>
        </a>
        <a href="/transactions" class="flex flex-col items-center p-2 flex-1 max-w-[20%] rounded-lg hover:bg-zinc-700 transition-all duration-100 {page.url.pathname === '/transactions' ? 'text-[var(--accent)]' : ''}">
            <ListMinus class="size-8"/>
            <p class="text-xs whitespace-nowrap">Trans.</p>
        </a>
        <a href="/budgets" class="flex flex-col items-center p-2 flex-1 max-w-[20%] rounded-lg hover:bg-zinc-700 transition-all duration-100 {page.url.pathname === '/budgets' ? 'text-[var(--accent)]' : ''}">
            <PiggyBank class="size-8"/>
            <p class="text-xs whitespace-nowrap">Budgets</p>
        </a>
        <a href="/reports" class="flex flex-col items-center p-2 flex-1 max-w-[20%] rounded-lg hover:bg-zinc-700 transition-all duration-100 {page.url.pathname === '/reports' ? 'text-[var(--accent)]' : ''}">
            <FileText class="size-8"/>
            <p class="text-xs whitespace-nowrap">Reports</p>
        </a>
        <a href="/settings" class="flex flex-col items-center p-2 flex-1 max-w-[20%] rounded-lg hover:bg-zinc-700 transition-all duration-100 {page.url.pathname === '/settings' ? 'text-[var(--accent)]' : ''}">
            <Sliders class="size-8"/>
            <p class="text-xs whitespace-nowrap">Settings</p>
        </a>
    </div>
</nav>