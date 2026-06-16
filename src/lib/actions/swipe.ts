export type SwipeDirection = 'left' | 'right' | 'up' | 'down';
export type SwipeAxis = 'horizontal' | 'vertical';

export type SwipeOptions = {
	threshold?: number;
	axis?: SwipeAxis; // 'horizontal' for left/right, 'vertical' for up/down
	canStart?: () => boolean; // Optional function to check if swipe can start
	onSwipeStart?: () => void;
	onSwipeMove?: (distance: number) => void;
	onSwipeEnd?: (direction: SwipeDirection | null) => void;
	onSwipeLeft?: () => void;
	onSwipeRight?: () => void;
	onSwipeUp?: () => void;
	onSwipeDown?: () => void;
};

/** `Event.target` can be a `Text` node; `Element.prototype.closest` is not on `Node`. */
function eventTargetElement(event: Event): Element | null {
	const t = event.target;
	if (t instanceof Element) return t;
	if (t instanceof Text && t.parentElement) return t.parentElement;
	return null;
}

export function swipe(
	node: HTMLElement,
	options: SwipeOptions | undefined = {}
): { destroy: () => void } {
	// Check for a browser environment
	if (typeof window === 'undefined' || typeof document === 'undefined' || !options) {
		return { destroy: () => {} };
	}

	const threshold = options.threshold || 100;
	const axis = options.axis || 'horizontal';
	let startX = 0;
	let startY = 0;
	let currentX = 0;
	let currentY = 0;
	let isSwiping = false;
	let swipeStarted = false;
	// Once vertical scroll intent is detected, this gesture is scroll-only — don't start horizontal swipe
	let verticalLocked = false;
	/** Primary button is down after mousedown on this node; drives document-level mouse tracking. */
	let mousePointerDown = false;

	function reset() {
		document.removeEventListener('mousemove', documentMouseMove, true);
		document.removeEventListener('mouseup', documentMouseUp, true);
		mousePointerDown = false;
		startX = 0;
		startY = 0;
		currentX = 0;
		currentY = 0;
		isSwiping = false;
		swipeStarted = false;
		verticalLocked = false;
	}

	function applyMove(clientX: number, clientY: number, e: Event) {
		const deltaX = clientX - startX;
		const deltaY = clientY - startY;

		const lockThreshold = 8;
		const horizontalDominates = axis === 'horizontal' && Math.abs(deltaX) > Math.abs(deltaY);
		const verticalDominates = axis === 'horizontal' && Math.abs(deltaY) > Math.abs(deltaX);

		if (!verticalLocked && verticalDominates && Math.abs(deltaY) >= lockThreshold) {
			verticalLocked = true;
		}

		if (!isSwiping) {
			if (
				axis === 'horizontal' &&
				Math.abs(deltaX) > 10 &&
				horizontalDominates &&
				!verticalLocked
			) {
				isSwiping = true;
				if (!swipeStarted) {
					swipeStarted = true;
					options.onSwipeStart?.();
				}
			} else if (axis === 'vertical' && Math.abs(deltaY) > 10) {
				if (Math.abs(deltaY) > Math.abs(deltaX)) {
					isSwiping = true;
					if (!swipeStarted) {
						swipeStarted = true;
						options.onSwipeStart?.();
					}
				}
			}
		}

		const shouldLockScroll =
			isSwiping ||
			(axis === 'horizontal' &&
				horizontalDominates &&
				!verticalLocked &&
				Math.abs(deltaX) >= lockThreshold);
		if (shouldLockScroll) {
			e.preventDefault();
			if (isSwiping) {
				e.stopPropagation();
				currentX = clientX;
				currentY = clientY;
				const distance = axis === 'horizontal' ? deltaX : deltaY;
				options.onSwipeMove?.(distance);
			}
		}
	}

	function documentMouseMove(e: MouseEvent) {
		if (!mousePointerDown) return;
		const el = eventTargetElement(e);
		if (el?.closest('[draggable="true"]')) {
			handleEnd(e);
			return;
		}
		applyMove(e.clientX, e.clientY, e);
	}

	function documentMouseUp(e: MouseEvent) {
		if (!mousePointerDown) return;
		if (e.button !== 0) return;
		handleEnd(e);
	}

	function handleEnd(e?: Event) {
		if (!isSwiping || !swipeStarted) {
			reset();
			return;
		}

		if (e) {
			e.stopPropagation();
		}

		let distance: number;
		let direction: SwipeDirection | null = null;

		if (axis === 'horizontal') {
			distance = currentX - startX;
			if (Math.abs(distance) > threshold) {
				if (distance > 0) {
					direction = 'right';
					options.onSwipeRight?.();
				} else {
					direction = 'left';
					options.onSwipeLeft?.();
				}
			}
		} else {
			distance = currentY - startY;
			if (Math.abs(distance) > threshold) {
				if (distance > 0) {
					direction = 'down';
					options.onSwipeDown?.();
				} else {
					direction = 'up';
					options.onSwipeUp?.();
				}
			}
		}

		options.onSwipeEnd?.(direction);
		reset();
	}

	const handleStart = (e: Event) => {
		const el = eventTargetElement(e);
		if (el?.closest('[draggable="true"]') || el?.closest('.drag-handle')) {
			return;
		}

		if (options.canStart && !options.canStart()) {
			return;
		}

		if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent && e.touches.length > 0) {
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
			currentX = startX;
			currentY = startY;
			isSwiping = false;
			swipeStarted = false;
			verticalLocked = false;
		} else if (typeof MouseEvent !== 'undefined' && e instanceof MouseEvent) {
			if (e.button !== 0) return;
			startX = e.clientX;
			startY = e.clientY;
			currentX = startX;
			currentY = startY;
			isSwiping = false;
			swipeStarted = false;
			verticalLocked = false;
			mousePointerDown = true;
			document.addEventListener('mousemove', documentMouseMove, true);
			document.addEventListener('mouseup', documentMouseUp, true);
		}
	};

	const handleTouchMove = (e: Event) => {
		if (
			!(typeof TouchEvent !== 'undefined' && e instanceof TouchEvent && e.touches.length > 0)
		) {
			return;
		}

		const el = eventTargetElement(e);
		if (el?.closest('[draggable="true"]')) {
			reset();
			return;
		}

		const clientX = e.touches[0].clientX;
		const clientY = e.touches[0].clientY;
		applyMove(clientX, clientY, e);
	};

	const touchEndHandler = (e: Event) => handleEnd(e);
	const touchCancelHandler = (e: Event) => handleEnd(e);

	node.addEventListener('mousedown', handleStart);
	node.addEventListener('touchstart', handleStart, { passive: true });
	node.addEventListener('touchmove', handleTouchMove, { passive: false });
	node.addEventListener('touchend', touchEndHandler);
	node.addEventListener('touchcancel', touchCancelHandler);

	return {
		destroy() {
			reset();
			node.removeEventListener('mousedown', handleStart);
			node.removeEventListener('touchstart', handleStart);
			node.removeEventListener('touchmove', handleTouchMove);
			node.removeEventListener('touchend', touchEndHandler);
			node.removeEventListener('touchcancel', touchCancelHandler);
		}
	};
}
