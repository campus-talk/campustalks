import { useEffect, useRef, useCallback } from 'react';

interface ScrollPositionStore {
  [key: string]: number;
}

// Global scroll position store
const scrollPositions: ScrollPositionStore = {};

/**
 * Hook to preserve and restore scroll position for a specific key (e.g., tab name).
 * Used for WhatsApp-like tab persistence where scroll position is maintained.
 */
export const useScrollPosition = (
  key: string,
  scrollRef: React.RefObject<HTMLElement>
) => {
  const isRestoring = useRef(false);

  // Restore scroll position on mount
  useEffect(() => {
    const savedPosition = scrollPositions[key];
    
    if (savedPosition && scrollRef.current) {
      isRestoring.current = true;
      
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = savedPosition;
        }
        
        // Reset flag after a short delay
        setTimeout(() => {
          isRestoring.current = false;
        }, 100);
      });
    }
  }, [key, scrollRef]);

  // Save scroll position handler
  const handleScroll = useCallback(() => {
    if (!isRestoring.current && scrollRef.current) {
      scrollPositions[key] = scrollRef.current.scrollTop;
    }
  }, [key, scrollRef]);

  // Set up scroll listener
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    element.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll, scrollRef]);

  // Return current position for debugging
  return {
    currentPosition: scrollPositions[key] || 0,
    savePosition: handleScroll,
  };
};

/**
 * Get stored scroll position for a key without using a hook.
 */
export const getScrollPosition = (key: string): number => {
  return scrollPositions[key] || 0;
};

/**
 * Manually set scroll position for a key.
 */
export const setScrollPosition = (key: string, position: number): void => {
  scrollPositions[key] = position;
};
