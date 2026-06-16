# Flexible Layout System

This layout system solves the problem of conflicting fixed elements (like mobile navigation and page-specific action buttons) by providing a flexible, composable approach to page layouts.

## Components

### `AppLayout`

The root layout component that handles the overall app structure, including the desktop sidebar and main content area.

### `PageLayout`

A flexible page layout that allows pages to define their own top bar, bottom bar, and content areas.

### `MobileNavigation`

The mobile navigation component that can be included in any page's bottom bar.

## Usage Examples

### Basic Page (Content Only)

```svelte
<script lang="ts">
	import { PageLayout } from '$lib/components/layouts';
</script>

<PageLayout>
	<div class="p-4">
		<h1>My Page Content</h1>
		<p>Regular page content here...</p>
	</div>
</PageLayout>
```

### Page with Mobile Navigation Only

```svelte
<script lang="ts">
	import { PageLayout, MobileNavigation } from '$lib/components/layouts';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';

	const sidebar = Sidebar.useSidebar();
</script>

<PageLayout>
	{#snippet bottomBar()}
		{#if sidebar.isMobile}
			<MobileNavigation />
		{/if}
	{/snippet}

	<div class="p-4">
		<h1>My Page Content</h1>
		<p>Content with mobile navigation...</p>
	</div>
</PageLayout>
```

### Page with Header and Action Buttons

```svelte
<script lang="ts">
	import { PageLayout, MobileNavigation } from '$lib/components/layouts';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';

	const sidebar = Sidebar.useSidebar();

	function handleSave() {
		// Handle save action
	}
</script>

<PageLayout>
	{#snippet topBar()}
		<header class="border-border border-b p-4">
			<h1 class="text-2xl font-bold">Page Title</h1>
			<p class="text-muted-foreground">Page description</p>
		</header>
	{/snippet}

	{#snippet bottomBar()}
		<!-- Action buttons -->
		<div class="border-border border-t p-4">
			<div class="flex justify-end space-x-2">
				<Button.Root variant="outline">Cancel</Button.Root>
				<Button.Root onclick={handleSave}>Save</Button.Root>
			</div>
		</div>

		<!-- Mobile Navigation -->
		{#if sidebar.isMobile}
			<MobileNavigation />
		{/if}
	{/snippet}

	<div class="p-4">
		<h1>My Page Content</h1>
		<p>Content with header and action buttons...</p>
	</div>
</PageLayout>
```

### Form Page with Submit Actions

```svelte
<script lang="ts">
	import { PageLayout, MobileNavigation } from '$lib/components/layouts';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';

	const sidebar = Sidebar.useSidebar();
	let isLoading = $state(false);

	function handleSubmit(event: Event) {
		event.preventDefault();
		// Handle form submission
	}
</script>

<PageLayout>
	{#snippet topBar()}
		<header class="border-border border-b p-4">
			<h1 class="text-2xl font-bold">Create New Item</h1>
		</header>
	{/snippet}

	{#snippet bottomBar()}
		<!-- Form actions -->
		<div class="border-border border-t p-4">
			<div class="flex justify-end space-x-2">
				<Button.Root type="button" variant="outline" disabled={isLoading}
					>Cancel</Button.Root
				>
				<Button.Root type="submit" form="my-form" disabled={isLoading}>
					{isLoading ? 'Creating...' : 'Create'}
				</Button.Root>
			</div>
		</div>

		<!-- Mobile Navigation -->
		{#if sidebar.isMobile}
			<MobileNavigation />
		{/if}
	{/snippet}

	<div class="p-4">
		<form id="my-form" onsubmit={handleSubmit}>
			<!-- Form fields here -->
		</form>
	</div>
</PageLayout>
```

### Page with Custom Bottom Bar (No Navigation)

```svelte
<script lang="ts">
	import { PageLayout } from '$lib/components/layouts';
	import * as Button from '$lib/components/ui/button/index.ts';
</script>

<PageLayout>
	{#snippet bottomBar()}
		<div class="bg-accent/50 border-border border-t p-4">
			<div class="flex items-center justify-between">
				<span class="text-muted-foreground text-sm">Status: Ready</span>
				<Button.Root size="sm">Quick Action</Button.Root>
			</div>
		</div>
	{/snippet}

	<div class="p-4">
		<h1>Custom Bottom Bar</h1>
		<p>This page has a custom bottom bar without navigation...</p>
	</div>
</PageLayout>
```

## Key Benefits

1. **No More Conflicts**: Mobile navigation and page-specific buttons are properly layered
2. **Flexible**: Pages can choose to have top bars, bottom bars, or neither
3. **Consistent**: All pages use the same layout system
4. **Mobile-First**: Automatically handles mobile vs desktop differences
5. **Type Safe**: Full TypeScript support with proper prop interfaces

## Migration Guide

To migrate existing pages:

1. Wrap your page content in `<PageLayout>`
2. Move any fixed headers to the `topBar` snippet
3. Move any fixed bottom buttons to the `bottomBar` snippet
4. Add `<MobileNavigation />` to the bottom bar if needed
5. Remove old fixed positioning classes and manual height calculations

## Layout Hierarchy

```
AppLayout (root)
├── Desktop Sidebar (from Navigation.svelte)
└── Main Content Area
    └── PageLayout (per page)
        ├── Top Bar (optional)
        ├── Scrollable Content
        └── Bottom Bar (optional)
            ├── Page Actions
            └── Mobile Navigation (if mobile)
```
