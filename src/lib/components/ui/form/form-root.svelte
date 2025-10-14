<script lang="ts">
  interface Props {
    class?: string;
    onsubmit?: (event: SubmitEvent) => void;
    children?: any;
  }

  let { class: className = "", onsubmit, children, ...restProps }: Props = $props();
</script>

<form class={className} onsubmit={onsubmit} {...restProps}>
  {@render children?.()}
</form>
