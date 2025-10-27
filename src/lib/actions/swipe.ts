export type SwipeDirection = 'left' | 'right';

export type SwipeOptions = {
	threshold?: number;
	onSwipeStart?: () => void;
	onSwipeMove?: (distance: number) => void;
	onSwipeEnd?: (direction: SwipeDirection | null) => void;
	onSwipeLeft?: () => void;
	onSwipeRight?: () => void;
};

export function swipe(
	node: HTMLElement,
	options: SwipeOptions = {}
): { destroy: () => void } {
	// Check if we're in a browser environment
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return { destroy: () => {} };
	}

	const threshold = options.threshold || 100;
	let startX = 0;
	let startY = 0;
	let currentX = 0;
	let isSwiping = false;
	let swipeStarted = false;

	const handleStart = (e: Event) => {
		if (e instanceof TouchEvent && e.touches.length > 0) {
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
			currentX = startX;
			isSwiping = false;
			swipeStarted = false;
		} else if (e instanceof MouseEvent) {
			startX = e.clientX;
			startY = e.clientY;
			currentX = startX;
			isSwiping = false;
			swipeStarted = false;
		}
	};

	const handleMove = (e: Event) => {
		if (!startX) return;

		let clientX = 0;
		let clientY = 0;

		if (e instanceof TouchEvent && e.touches.length > 0) {
			clientX = e.touches[0].clientX;
			clientY = e.touches[0].clientY;
		} else if (e instanceof MouseEvent) {
			clientX = e.clientX;
			clientY = e.clientY;
		}

		const deltaX = clientX - startX;
		const deltaY = clientY - startY;

		// Detect if this is a horizontal swipe (not vertical scroll)
		if (!isSwiping && Math.abs(deltaX) > 10) {
			if (Math.abs(deltaX) > Math.abs(deltaY)) {
				isSwiping = true;
				if (!swipeStarted) {
					swipeStarted = true;
					options.onSwipeStart?.();
				}
			}
		}

		if (isSwiping) {
			e.preventDefault();
			e.stopPropagation(); // Prevent drawer from closing
			currentX = clientX;
			options.onSwipeMove?.(deltaX);
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

		const distance = currentX - startX;
		let direction: SwipeDirection | null = null;

		if (Math.abs(distance) > threshold) {
			if (distance > 0) {
				direction = 'right';
				options.onSwipeRight?.();
			} else {
				direction = 'left';
				options.onSwipeLeft?.();
			}
		}

		options.onSwipeEnd?.(direction);
		reset();
	};

	const reset = () => {
		startX = 0;
		startY = 0;
		currentX = 0;
		isSwiping = false;
		swipeStarted = false;
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

