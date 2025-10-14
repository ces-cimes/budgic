# Header Component

The Header component provides a consistent header layout with optional back button functionality and sidebar integration.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | `''` | The main title displayed in the header |
| `children` | `any` | `null` | Slot content for additional header actions |
| `showBackButton` | `boolean` | `false` | Whether to show a back button |
| `backButtonLink` | `string` | `''` | Specific link to navigate to when back button is clicked |
| `backButtonLabel` | `string` | `'Back'` | Label text for the back button |

## Usage Examples

### Basic Header
```svelte
<Header title="My Page" />
```

### Header with Actions
```svelte
<Header title="My Page">
  <Button.Root onclick={handleAction}>
    Action Button
  </Button.Root>
</Header>
```

### Header with Back Button (Browser Navigation)
```svelte
<Header 
  title="Edit Item"
  showBackButton={true}
  backButtonLabel="Go Back"
/>
```

### Header with Back Button (Specific Link)
```svelte
<Header 
  title="Add Category"
  showBackButton={true}
  backButtonLink="/categories"
  backButtonLabel="Back to Categories"
/>
```

### Header with Back Button and Actions
```svelte
<Header 
  title="Edit Profile"
  showBackButton={true}
  backButtonLink="/profile"
  backButtonLabel="Back to Profile"
>
  <Button.Root onclick={handleSave}>
    Save Changes
  </Button.Root>
</Header>
```

## Behavior

- **Button Order**: Sidebar trigger is always first (when not on mobile), followed by back button (when enabled)
- **Navigation**: If `backButtonLink` is provided, it uses SvelteKit's `goto()` function. Otherwise, it uses browser's `history.back()`
- **Responsive**: Automatically hides sidebar trigger on mobile devices
- **Consistent Styling**: Uses the same styling patterns as the rest of the app
- **Icon**: Uses Lucide ArrowLeft icon for the back button for better visual consistency

## Integration with PageLayout

The Header component works seamlessly with the PageLayout system:

```svelte
<PageLayout>
  {#snippet topBar()}
    <Header 
      title="Page Title"
      showBackButton={true}
      backButtonLink="/previous-page"
    />
  {/snippet}
  
  <!-- Page content -->
</PageLayout>
```
