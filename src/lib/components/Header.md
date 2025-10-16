# Header Component

The Header component provides a consistent header layout with optional back button functionality, sidebar integration, and flexible button configuration.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | `''` | The main title displayed in the header |
| `description` | `string` | `''` | Optional subtitle/description text below the title |
| `buttonProps` | `ButtonConfig[]` | `[]` | Array of button configurations for header actions |
| `children` | `any` | `null` | Slot content for additional content below the header |
| `variant` | `'default' \| 'with-tabs'` | `'default'` | Header variant affecting children padding |
| `showBackButton` | `boolean` | `false` | Whether to show a back button |
| `backButtonLink` | `string` | `''` | Specific link to navigate to when back button is clicked |
| `backButtonLabel` | `string` | `'Back'` | Label text for the back button |

## ButtonConfig Interface

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | - | Button text (required) |
| `onclick` | `() => void` | - | Click handler function |
| `href` | `string` | - | Link URL (renders as anchor tag) |
| `variant` | `ButtonProps['variant']` | `'default'` | Button variant (default, destructive, outline, secondary, ghost, link) |
| `size` | `ButtonProps['size']` | `'default'` | Button size (default, sm, lg, icon, square) |
| `disabled` | `boolean` | `false` | Whether the button is disabled |
| `icon` | `any` | - | Lucide icon component |
| `className` | `string` | - | Additional CSS classes |
| `target` | `string` | - | Link target attribute |
| `rel` | `string` | - | Link rel attribute |

## Usage Examples

### Basic Header
```svelte
<Header title="My Page" />
```

### Header with Description
```svelte
<Header 
  title="Financial Planning"
  description="Track your spending and plan for the future"
/>
```

### Header with Single Button
```svelte
<Header 
  title="Accounts"
  buttonProps={[{
    text: "Add Account",
    onclick: () => goto('/accounts/add'),
    icon: Plus
  }]}
/>
```

### Header with Multiple Buttons
```svelte
<Header 
  title="Transactions"
  buttonProps={[
    {
      text: "Add Transaction",
      onclick: () => goto('/transactions/add'),
      icon: Plus
    },
    {
      text: "Export",
      onclick: () => exportData(),
      variant: "outline",
      icon: Download
    }
  ]}
/>
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
  description="Update your personal information"
  showBackButton={true}
  backButtonLink="/profile"
  backButtonLabel="Back to Profile"
  buttonProps={[{
    text: "Save Changes",
    onclick: handleSave,
    variant: "default"
  }]}
/>
```

### Header with Children Content
```svelte
<Header 
  title="Dashboard"
  description="Overview of your finances"
  buttonProps={[{
    text: "Refresh",
    onclick: refreshData,
    icon: RefreshCw
  }]}
>
  <div class="flex gap-4 mt-2">
    <div class="text-sm text-muted-foreground">
      Last updated: {lastUpdate}
    </div>
    <div class="text-sm text-success">
      Status: Active
    </div>
  </div>
</Header>
```

### Header with Tab Navigation
```svelte
<Header 
  title="Budget Categories"
  variant="with-tabs"
  buttonProps={[{
    text: "Add Category",
    onclick: () => goto('/budget/add'),
    icon: Plus
  }]}
>
  <TabNavigation tabs={budgetTabs} />
</Header>
```

## Layout Structure

The Header component uses a flexible layout with two variants:

### Default Variant
1. **Top Row**: Sidebar trigger, back button (if enabled), title/description, and action buttons (all on the same line)
2. **Bottom Section**: Children content with padding (`px-4 lg:px-6`)

### With-Tabs Variant
1. **Top Row**: Same as default variant
2. **Bottom Section**: Children content with no padding (for components like TabNavigation)

This layout allows for:
- Buttons to stay on the same line as the title
- Support for descriptions and subtitles
- Multiple action buttons without crowding
- Additional content below via children prop
- Proper integration with tab navigation components
- Better responsive behavior

## Behavior

- **Button Order**: Sidebar trigger is always first (when not on mobile), followed by back button (when enabled)
- **Navigation**: If `backButtonLink` is provided, it uses SvelteKit's `goto()` function. Otherwise, it uses browser's `history.back()`
- **Responsive**: Automatically hides sidebar trigger on mobile devices
- **Consistent Styling**: Uses the same styling patterns as the rest of the app
- **Icon**: Uses Lucide ArrowLeft icon for the back button for better visual consistency
- **Button Rendering**: Automatically renders buttons with proper spacing and alignment

## Integration with PageLayout

The Header component works seamlessly with the PageLayout system:

```svelte
<PageLayout>
  {#snippet topBar()}
    <Header 
      title="Page Title"
      description="Optional subtitle"
      showBackButton={true}
      backButtonLink="/previous-page"
      buttonProps={[{
        text: "Action",
        onclick: handleAction,
        icon: Plus
      }]}
    />
  {/snippet}
  
  <!-- Page content -->
</PageLayout>
```
