import { armNextActivationGhostSuppression } from '$lib/utils/ghost-click-suppression';

type LongPressOptions = {
	duration?: number;
	onStart?: () => void;
	onProgress?: (progress: number) => void;
	onCancel?: () => void;
};

export function longpress(
	node: HTMLElement,
	options: LongPressOptions | undefined = {}
): { update: (nextOptions?: LongPressOptions) => void; destroy: () => void } {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return { update: () => {}, destroy: () => {} };
	}

	const moveThreshold = 10;
	let currentOptions: LongPressOptions | undefined = options;

	let timer: ReturnType<typeof setTimeout> | null = null;
	let frameId: number | null = null;
	let startTime = 0;
	let startX = 0;
	let startY = 0;
	let hasMoved = false;
	let longPressTriggered = false;
	let pendingSelectOnRelease = false;

	let disarmPostLongPressGhost: (() => void) | null = null;

	function clearPostLongPressGhost() {
		if (disarmPostLongPressGhost) {
			disarmPostLongPressGhost();
			disarmPostLongPressGhost = null;
		}
	}

	function cleanup() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (frameId) {
			cancelAnimationFrame(frameId);
			frameId = null;
		}
		startTime = 0;
		hasMoved = false;
	}

	function getDuration(): number {
		return currentOptions?.duration || 800;
	}

	function isReleaseInsideNode(e: Event): boolean {
		if (e instanceof MouseEvent) {
			const el = document.elementFromPoint(e.clientX, e.clientY);
			return !!el && node.contains(el);
		}
		if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
			const touch = e.changedTouches[0];
			if (!touch) return false;
			const el = document.elementFromPoint(touch.clientX, touch.clientY);
			return !!el && node.contains(el);
		}
		const t = e.target;
		return t instanceof Node && node.contains(t);
	}

	const handleStart = (e: Event) => {
		if (!currentOptions) return;

		clearPostLongPressGhost();

		startTime = Date.now();
		hasMoved = false;
		longPressTriggered = false;
		pendingSelectOnRelease = false;

		if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent && e.touches.length > 0) {
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
		} else if (e instanceof MouseEvent) {
			startX = e.clientX;
			startY = e.clientY;
		}

		currentOptions.onStart?.();

		const updateProgress = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / getDuration(), 1);
			currentOptions?.onProgress?.(progress);

			if (progress < 1 && !hasMoved) {
				frameId = requestAnimationFrame(updateProgress);
			}
		};

		updateProgress();

		timer = setTimeout(() => {
			if (!hasMoved) {
				node.dispatchEvent(new CustomEvent('longpressready'));
				longPressTriggered = true;
				pendingSelectOnRelease = true;
				cleanup();
			}
		}, getDuration());
	};

	const handleMove = (e: Event) => {
		if (!startTime) return;

		let currentX = 0;
		let currentY = 0;

		if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent && e.touches.length > 0) {
			currentX = e.touches[0].clientX;
			currentY = e.touches[0].clientY;
		} else if (e instanceof MouseEvent) {
			currentX = e.clientX;
			currentY = e.clientY;
		}

		const deltaX = Math.abs(currentX - startX);
		const deltaY = Math.abs(currentY - startY);

		if (deltaX > moveThreshold || deltaY > moveThreshold) {
			handleAbort();
		}
	};

	const handleEnd = (e: Event) => {
		if (pendingSelectOnRelease && isReleaseInsideNode(e)) {
			node.dispatchEvent(new CustomEvent('longpress'));
		}
		if (longPressTriggered) {
			clearPostLongPressGhost();
			disarmPostLongPressGhost = armNextActivationGhostSuppression(node, { timeoutMs: 900 });
		}
		longPressTriggered = false;
		pendingSelectOnRelease = false;
		currentOptions?.onCancel?.();
		cleanup();
	};

	const handleAbort = () => {
		longPressTriggered = false;
		pendingSelectOnRelease = false;
		currentOptions?.onCancel?.();
		cleanup();
	};

	node.addEventListener('mousedown', handleStart);
	node.addEventListener('touchstart', handleStart, { passive: true });
	node.addEventListener('mousemove', handleMove);
	node.addEventListener('touchmove', handleMove, { passive: true });
	node.addEventListener('mouseup', handleEnd);
	node.addEventListener('mouseleave', handleAbort);
	node.addEventListener('touchend', handleEnd);
	node.addEventListener('touchcancel', handleAbort);

	return {
		update(nextOptions?: LongPressOptions) {
			currentOptions = nextOptions;
			// If the action gets disabled while pressing, cancel the active gesture immediately.
			if (!currentOptions) {
				handleAbort();
				clearPostLongPressGhost();
			}
		},
		destroy() {
			clearPostLongPressGhost();
			cleanup();
			node.removeEventListener('mousedown', handleStart);
			node.removeEventListener('touchstart', handleStart);
			node.removeEventListener('mousemove', handleMove);
			node.removeEventListener('touchmove', handleMove);
			node.removeEventListener('mouseup', handleEnd);
			node.removeEventListener('mouseleave', handleAbort);
			node.removeEventListener('touchend', handleEnd);
			node.removeEventListener('touchcancel', handleAbort);
		}
	};
}
