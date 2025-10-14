/**
 * Browser-safe utilities for SSR compatibility
 */

export const isBrowser = typeof window !== 'undefined';

export const isSSR = !isBrowser;

/**
 * Safe localStorage access with SSR fallback
 */
export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    if (isBrowser) {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        console.warn('localStorage access failed:', error);
        return null;
      }
    }
    return null;
  },
  
  setItem: (key: string, value: string): void => {
    if (isBrowser) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.warn('localStorage set failed:', error);
      }
    }
  },
  
  removeItem: (key: string): void => {
    if (isBrowser) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn('localStorage remove failed:', error);
      }
    }
  }
};

/**
 * Safe requestAnimationFrame with SSR fallback
 */
export const safeRequestAnimationFrame = (callback: FrameRequestCallback): number => {
  if (isBrowser && typeof requestAnimationFrame !== 'undefined') {
    return requestAnimationFrame(callback);
  }
  // Fallback for SSR - use setTimeout
  return setTimeout(callback, 16) as unknown as number;
};

/**
 * Safe cancelAnimationFrame with SSR fallback
 */
export const safeCancelAnimationFrame = (id: number): void => {
  if (isBrowser && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
};

/**
 * Check if IndexedDB is available
 */
export const isIndexedDBAvailable = (): boolean => {
  return isBrowser && typeof indexedDB !== 'undefined';
}; 