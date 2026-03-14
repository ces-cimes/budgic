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

export function swipe(
	node: HTMLElement,
	options: SwipeOptions | undefined = {}
): { destroy: () => void } {
	// Check if we're in a browser environment
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

	const handleStart = (e: Event) => {
		// Don't interfere with drag and drop - check if the target is draggable or inside a draggable element
		const target = e.target as HTMLElement;
		if (target?.closest('[draggable="true"]') || target?.closest('.drag-handle')) {
			return;
		}

		// Check if swipe can start (e.g., check scroll position)
		if (options.canStart && !options.canStart()) {
			return;
		}

		// Check if TouchEvent is available and if event is a TouchEvent
		if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent && e.touches.length > 0) {
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
			currentX = startX;
			currentY = startY;
			isSwiping = false;
			swipeStarted = false;
			verticalLocked = false;
		} else if (typeof MouseEvent !== 'undefined' && e instanceof MouseEvent) {
			startX = e.clientX;
			startY = e.clientY;
			currentX = startX;
			currentY = startY;
			isSwiping = false;
			swipeStarted = false;
			verticalLocked = false;
		}
	};

	const handleMove = (e: Event) => {
		if (!startX && !startY) return;

		// Don't interfere with drag and drop
		const target = e.target as HTMLElement;
		if (target?.closest('[draggable="true"]')) {
			reset();
			return;
		}

		let clientX = 0;
		let clientY = 0;

		// Check if TouchEvent is available and if event is a TouchEvent
		if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent && e.touches.length > 0) {
			clientX = e.touches[0].clientX;
			clientY = e.touches[0].clientY;
		} else if (typeof MouseEvent !== 'undefined' && e instanceof MouseEvent) {
			clientX = e.clientX;
			clientY = e.clientY;
		}

		const deltaX = clientX - startX;
		const deltaY = clientY - startY;

		// Axis lock: first gesture to dominate (past threshold) wins — horizontal = card swipe, vertical = panel scroll.
		const lockThreshold = 8;
		const horizontalDominates = axis === 'horizontal' && Math.abs(deltaX) > Math.abs(deltaY);
		const verticalDominates = axis === 'horizontal' && Math.abs(deltaY) > Math.abs(deltaX);

		// If user clearly started scrolling vertically, lock this gesture to scroll — don't start horizontal swipe even if they then move horizontally.
		if (!verticalLocked && verticalDominates && Math.abs(deltaY) >= lockThreshold) {
			verticalLocked = true;
		}

		if (!isSwiping) {
			if (axis === 'horizontal' && Math.abs(deltaX) > 10 && horizontalDominates && !verticalLocked) {
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

		// Prevent panel scroll only when we've committed to horizontal swipe (never when verticalLocked).
		const shouldLockScroll = isSwiping || (axis === 'horizontal' && horizontalDominates && !verticalLocked && Math.abs(deltaX) >= lockThreshold);
		if (shouldLockScroll) {
			e.preventDefault();
			if (isSwiping) {
				e.stopPropagation(); // Prevent drawer from closing
				currentX = clientX;
				currentY = clientY;
				const distance = axis === 'horizontal' ? deltaX : deltaY;
				options.onSwipeMove?.(distance);
			}
		}
	};

	const handleEnd = (e?: Event) => {
		if (!isSwiping || !swipeStarted) {
			reset();
			return;
		}

		// Prevent drawer from closing
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
	};

	const reset = () => {
		startX = 0;
		startY = 0;
		currentX = 0;
		currentY = 0;
		isSwiping = false;
		swipeStarted = false;
		verticalLocked = false;
	};

	node.addEventListener('mousedown', handleStart);
	node.addEventListener('touchstart', handleStart, { passive: true });
	node.addEventListener('mousemove', handleMove);
	node.addEventListener('touchmove', handleMove, { passive: false });
	
	const mouseUpHandler = (e: Event) => handleEnd(e);
	const mouseLeaveHandler = (e: Event) => handleEnd(e);
	const touchEndHandler = (e: Event) => handleEnd(e);
	const touchCancelHandler = (e: Event) => handleEnd(e);

	node.addEventListener('mouseup', mouseUpHandler);
	node.addEventListener('mouseleave', mouseLeaveHandler);
	node.addEventListener('touchend', touchEndHandler);
	node.addEventListener('touchcancel', touchCancelHandler);

	return {
		destroy() {
			node.removeEventListener('mousedown', handleStart);
			node.removeEventListener('touchstart', handleStart);
			node.removeEventListener('mousemove', handleMove);
			node.removeEventListener('touchmove', handleMove);
			node.removeEventListener('mouseup', mouseUpHandler);
			node.removeEventListener('mouseleave', mouseLeaveHandler);
			node.removeEventListener('touchend', touchEndHandler);
			node.removeEventListener('touchcancel', touchCancelHandler);
		}
	};
}

