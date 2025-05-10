<script lang="ts">
    import { page } from '$app/state';
    import { Settings, PiggyBank, SquarePen, SquareCheck, House } from '@lucide/svelte';
</script>

<nav class="rounded-t-xl fixed bottom-0 left-0 right-0 bg-zinc-800 p-2 pb-6 flex justify-between sm:justify-center">
    <div class="flex w-full justify-evenly md:gap-8">
        <a href="/" class="flex flex-col items-center p-2 flex-1 max-w-[20%] {page.url.pathname === '/' ? 'text-[var(--accent)]' : ''}">
            <House class="size-8"/>
            <p class="text-xs whitespace-nowrap">Home</p>
        </a>
        <a href="/plan" class="flex flex-col items-center p-2 flex-1 max-w-[20%] {page.url.pathname === '/plan' ? 'text-[var(--accent)]' : ''}">
            <SquarePen class="size-8"/>
            <p class="text-xs whitespace-nowrap">Plan</p>
        </a>
        <a href="/completed" class="flex flex-col items-center p-2 flex-1 max-w-[20%] {page.url.pathname === '/completed' ? 'text-[var(--accent)]' : ''}">
            <SquareCheck class="size-8"/>
            <p class="text-xs whitespace-nowrap">Done</p>
        </a>
        <a href="/savings" class="flex flex-col items-center p-2 flex-1 max-w-[20%] {page.url.pathname === '/savings' ? 'text-[var(--accent)]' : ''}">
            <PiggyBank class="size-8"/>
            <p class="text-xs whitespace-nowrap">Savings</p>
        </a>
        <a href="/settings" class="flex flex-col items-center p-2 flex-1 max-w-[20%] {page.url.pathname === '/settings' ? 'text-[var(--accent)]' : ''}">
            <Settings class="size-8"/>
            <p class="text-xs whitespace-nowrap">Settings</p>
        </a>
    </div>
</nav>