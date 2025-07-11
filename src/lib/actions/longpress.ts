type LongPressOptions = {
    duration?: number;
    onStart?: () => void;
    onProgress?: (progress: number) => void;
    onCancel?: () => void;
  };
  
  export function longpress(
    node: HTMLElement,
    options: LongPressOptions = {}
  ): { destroy: () => void } {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { destroy: () => {} };
    }
  
    const duration = options.duration || 800;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startTime = 0;
    let frameId: number | null = null;
    let startX = 0;
    let startY = 0;
    let hasMoved = false;
    const moveThreshold = 10;
  
    const handleStart = (e: Event) => {
      // Additional check for browser environment within the handler
      if (typeof TouchEvent === 'undefined') return;
      
      startTime = Date.now();
      hasMoved = false;
      
      if (e instanceof TouchEvent && e.touches.length > 0) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else if (e instanceof MouseEvent) {
        startX = e.clientX;
        startY = e.clientY;
      }
      
      options.onStart?.();
  
      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        options.onProgress?.(progress);
  
        if (progress < 1 && !hasMoved) {
          frameId = requestAnimationFrame(updateProgress);
        }
      };
  
      updateProgress();
  
      timer = setTimeout(() => {
        if (!hasMoved) {
          node.dispatchEvent(new CustomEvent('longpress'));
          cleanup();
        }
      }, duration);
    };
  
    const handleMove = (e: Event) => {
      // Additional check for browser environment within the handler
      if (typeof TouchEvent === 'undefined') return;
      
      if (!startTime) return;
      
      let currentX = 0;
      let currentY = 0;
      
      if (e instanceof TouchEvent && e.touches.length > 0) {
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;
      } else if (e instanceof MouseEvent) {
        currentX = e.clientX;
        currentY = e.clientY;
      }
      
      const deltaX = Math.abs(currentX - startX);
      const deltaY = Math.abs(currentY - startY);
      
      if (deltaX > moveThreshold || deltaY > moveThreshold) {
        hasMoved = true;
        handleCancel();
      }
    };
  
    const handleCancel = () => {
      options.onCancel?.();
      cleanup();
    };
  
    const cleanup = () => {
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
    };
  
    node.addEventListener('mousedown', handleStart);
    node.addEventListener('touchstart', handleStart, { passive: true });
    node.addEventListener('mousemove', handleMove);
    node.addEventListener('touchmove', handleMove, { passive: true });
    node.addEventListener('mouseup', handleCancel);
    node.addEventListener('mouseleave', handleCancel);
    node.addEventListener('touchend', handleCancel);
    node.addEventListener('touchcancel', handleCancel);
  
    return {
      destroy() {
        cleanup();
        node.removeEventListener('mousedown', handleStart);
        node.removeEventListener('touchstart', handleStart);
        node.removeEventListener('mousemove', handleMove);
        node.removeEventListener('touchmove', handleMove);
        node.removeEventListener('mouseup', handleCancel);
        node.removeEventListener('mouseleave', handleCancel);
        node.removeEventListener('touchend', handleCancel);
        node.removeEventListener('touchcancel', handleCancel);
      },
    };
  }