<script lang="ts">
  import type { BadgesTabProps, BadgeInsight } from '../types';

  interface Props {
    userCurrency: string;
    isLoading: boolean;
    onViewDetails?: (badgeId: string) => void;
    className?: string;
  }

  const { userCurrency, isLoading, onViewDetails, className = '' }: Props = $props();

  // Get badges from insights service
  const badges = $derived(() => {
    // For now, return empty array since we don't have a badges system yet
    // This will be implemented in future phases
    return [];
  });
</script>