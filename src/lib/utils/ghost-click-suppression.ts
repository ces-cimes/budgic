/** Default window to swallow stray activations after swipe / long-press. */
const DEFAULT_GHOST_TIMEOUT_MS = 500;

/**
 * After a completed long-press, swallow the next `click` that targets `root` (or a descendant).
 * Uses document capture so DevTools touch simulation and odd targeting still get one clean swallow.
 */
export function armNextActivationGhostSuppression(
	root: HTMLElement,
	options?: { timeoutMs?: number }
): () => void {
	if (typeof document === 'undefined') {
		return () => {};
	}

	const timeoutMs = options?.timeoutMs ?? DEFAULT_GHOST_TIMEOUT_MS;
	let cleaned = false;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;
		document.removeEventListener('click', onDocClickCapture, true);
		if (timeoutId != null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	function onDocClickCapture(e: Event) {
		cleanup();
		const t = e.target;
		if (t instanceof Node && root.contains(t)) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}

	document.addEventListener('click', onDocClickCapture, true);
	timeoutId = setTimeout(cleanup, timeoutMs);

	return cleanup;
}

export type DistanceThresholdGhostSuppression = {
	onGestureStart: () => void;
	recordMove: (distance: number) => void;
	armIfThresholdMet: () => void;
	/** Bubble-phase handlers: swallow next click anywhere while armed. */
	consume: (e: Event) => boolean;
	/** Capture on a surface: swallow only if target is inside `root`. */
	consumeInSubtree: (e: Event, root: HTMLElement) => boolean;
	disarm: () => void;
};

/**
 * Arm after horizontal swipe passed a minimum travel distance; consume the following stray `click`
 * (same pattern as notification cards and month swipe).
 */
export function createDistanceThresholdGhostSuppression(
	minTravelPx: number,
	options?: { timeoutMs?: number }
): DistanceThresholdGhostSuppression {
	const timeoutMs = options?.timeoutMs ?? DEFAULT_GHOST_TIMEOUT_MS;
	let maxAbs = 0;
	let armed = false;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	function clearTimer() {
		if (timeoutId != null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	}

	function disarm() {
		armed = false;
		clearTimer();
	}

	function onGestureStart() {
		maxAbs = 0;
	}

	function recordMove(distance: number) {
		maxAbs = Math.max(maxAbs, Math.abs(distance));
	}

	function armIfThresholdMet() {
		if (maxAbs < minTravelPx) {
			maxAbs = 0;
			return;
		}
		maxAbs = 0;
		armed = true;
		clearTimer();
		timeoutId = setTimeout(() => {
			timeoutId = null;
			armed = false;
		}, timeoutMs);
	}

	function swallow(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
		disarm();
	}

	function consume(e: Event): boolean {
		if (!armed) return false;
		swallow(e);
		return true;
	}

	function consumeInSubtree(e: Event, root: HTMLElement): boolean {
		if (!armed) return false;
		const t = e.target;
		if (!(t instanceof Node) || !root.contains(t)) return false;
		swallow(e);
		return true;
	}

	return {
		onGestureStart,
		recordMove,
		armIfThresholdMet,
		consume,
		consumeInSubtree,
		disarm,
	};
}
