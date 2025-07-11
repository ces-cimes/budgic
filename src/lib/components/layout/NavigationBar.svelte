<script lang="ts">
    import { page } from '$app/state';
    import { CalendarDays, ChartPie, Sliders, Sun, SquarePen } from '@lucide/svelte';

    const pages = [
        {
            href: '/',
            name: 'Home',
            icon: Sun
        },
        {
            href: '/transactions',
            name: 'Trans.',
            icon: SquarePen
        },
        {
            href: '/plan',
            name: 'Plan',
            icon: CalendarDays
        },
        {
            href: '/insights',
            name: 'Insights',
            icon: ChartPie
        },
        {
            href: '/settings',
            name: 'Setup',
            icon: Sliders
        }
    ];
</script>

<nav class="z-50 rounded-t-xl fixed bottom-0 left-0 right-0 p-2 flex justify-between sm:justify-center from-bg-primary/60 to-bg-primary bg-gradient-to-t backdrop-blur-sm border-t border-primary text-shadow-lg">
    <div class="flex w-full justify-evenly md:gap-8">
        {#each pages as navbutton}
            {@const Icon = navbutton.icon}
            <a href={navbutton.href} class="flex flex-col items-center p-2 flex-1 max-w-[20%] rounded-lg hover:bg-bg-secondary/50 hover:backdrop-blur-sm transition-all duration-150 {page.url.pathname === navbutton.href ? 'text-[var(--accent)] font-semibold' : 'text-text-secondary tracking-tight'}">
                <Icon class="size-8"/>
                <p class="text-xs whitespace-nowrap">{navbutton.name}</p>
            </a>
        {/each}
    </div>
</nav>