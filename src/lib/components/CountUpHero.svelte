<script lang="ts">
	/**
	 * Animates a number from 0 to value over 600ms when value is set (ease-out).
	 * Respects prefers-reduced-motion: no animation, show final value immediately.
	 */
	interface Props {
		value: number;
		format: (n: number) => string;
		className?: string;
		/** When false, show 0 and do not animate; when true, animate from 0 to value (e.g. pass isLoaded). */
		ready?: boolean;
		/** Delay in ms before starting the animation (e.g. to stagger with other content). */
		delay?: number;
	}

	let { value, format, className = '', ready = true, delay = 0 }: Props = $props();

	let displayValue = $state(0);
	let hasAnimated = $state(false);

	function easeOutCubic(t: number): number {
		return 1 - Math.pow(1 - t, 3);
	}

	function runAnimation(endVal: number) {
		const prefersReducedMotion =
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReducedMotion) {
			displayValue = endVal;
			hasAnimated = true;
			return () => {};
		}

		const duration = 600;
		let startTime: number | null = null;
		let rafId: number;

		function tick(now: number) {
			if (startTime === null) startTime = now;
			const elapsed = now - startTime;
			const t = Math.min(1, Math.max(0, (elapsed - delay) / duration));
			const eased = easeOutCubic(t);
			displayValue = endVal * eased;
			if (t < 1) {
				rafId = requestAnimationFrame(tick);
			} else {
				displayValue = endVal;
				hasAnimated = true;
			}
		}

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	}

	$effect(() => {
		const target = value;
		if (hasAnimated) {
			displayValue = target;
			return;
		}
		if (!ready) {
			displayValue = 0;
			return;
		}
		let cancel: (() => void) | undefined;
		const id = setTimeout(() => {
			cancel = runAnimation(target);
		}, 0);
		return () => {
			clearTimeout(id);
			cancel?.();
		};
	});
</script>

<span class="text-hero animate-count-up {className}">{format(displayValue)}</span>
