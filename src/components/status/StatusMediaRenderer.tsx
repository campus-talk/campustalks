import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StatusMediaRendererProps {
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | 'text';
  content: string | null;
  backgroundColor: string | null;
  onMediaReady: () => void;
  onMediaError?: () => void;
  isMuted?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

const LOAD_TIMEOUT = 15000; // 15 seconds max wait

/**
 * Renders status media (image/video/text) with proper signed URL handling.
 * Handles loading states, errors, and timeouts gracefully.
 */
const StatusMediaRenderer = memo(({
  mediaUrl,
  mediaType,
  content,
  backgroundColor,
  onMediaReady,
  onMediaError,
  isMuted = true,
  videoRef: externalVideoRef,
}: StatusMediaRendererProps) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Generate signed URL for private bucket
  const generateSignedUrl = useCallback(async () => {
    if (!mediaUrl || mediaType === 'text') {
      setLoading(false);
      onMediaReady();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Extract storage path from URL
      const storagePath = extractStoragePath(mediaUrl);
      
      if (!storagePath) {
        // Not a Supabase URL, use directly
        setSignedUrl(mediaUrl);
        return;
      }

      const { data, error: signError } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(storagePath, 3600); // 1 hour validity

      if (signError) {
        throw new Error(signError.message);
      }

      setSignedUrl(data.signedUrl);
    } catch (err: any) {
      console.error('Failed to generate signed URL:', err);
      setError('Failed to load media');
      setLoading(false);
      onMediaError?.();
    }
  }, [mediaUrl, mediaType, onMediaReady, onMediaError]);

  // Generate signed URL on mount and when mediaUrl changes
  useEffect(() => {
    generateSignedUrl();
  }, [generateSignedUrl]);

  // Set up load timeout
  useEffect(() => {
    if (loading && (mediaType === 'image' || mediaType === 'video')) {
      loadTimeoutRef.current = setTimeout(() => {
        if (loading) {
          setError('Media took too long to load');
          setLoading(false);
          onMediaError?.();
        }
      }, LOAD_TIMEOUT);
    }

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, [loading, mediaType, onMediaError]);

  const handleImageLoad = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    setLoading(false);
    onMediaReady();
  }, [onMediaReady]);

  const handleVideoReady = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    setLoading(false);
    onMediaReady();
    
    // Auto-play video
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay blocked, user needs to interact
      });
    }
  }, [onMediaReady, videoRef]);

  const handleMediaError = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    setError('Failed to load media');
    setLoading(false);
    onMediaError?.();
  }, [onMediaError]);

  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
    setError(null);
    generateSignedUrl();
  }, [generateSignedUrl]);

  // Text status
  if (mediaType === 'text') {
    return (
      <motion.p
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-white text-xl sm:text-2xl font-medium text-center leading-relaxed px-4"
      >
        {content}
      </motion.p>
    );
  }

  // Error state with retry
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 text-white/70">
        <AlertCircle className="w-12 h-12" />
        <p className="text-center">{error}</p>
        {retryCount < 3 && (
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        )}
      </div>
    );
  }

  // Loading state
  if (loading && !signedUrl) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  // Video rendering
  if (mediaType === 'video' && signedUrl) {
    return (
      <div className="relative w-full h-full">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 animate-spin text-white/50" />
          </div>
        )}
        <video
          ref={videoRef}
          src={signedUrl}
          className={cn(
            "w-full h-full object-contain transition-opacity",
            loading ? "opacity-0" : "opacity-100"
          )}
          muted={isMuted}
          playsInline
          preload="auto"
          onLoadedData={handleVideoReady}
          onCanPlay={handleVideoReady}
          onError={handleMediaError}
        />
      </div>
    );
  }

  // Image rendering
  if (mediaType === 'image' && signedUrl) {
    return (
      <div className="relative w-full h-full">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 animate-spin text-white/50" />
          </div>
        )}
        <img
          src={signedUrl}
          alt="Status"
          className={cn(
            "w-full h-full object-contain transition-opacity",
            loading ? "opacity-0" : "opacity-100"
          )}
          onLoad={handleImageLoad}
          onError={handleMediaError}
          loading="eager"
        />
      </div>
    );
  }

  return null;
});

StatusMediaRenderer.displayName = 'StatusMediaRenderer';

// Helper function to extract storage path from URL
function extractStoragePath(url: string): string | null {
  try {
    const bucketName = 'chat-attachments';
    const publicPattern = `/storage/v1/object/public/${bucketName}/`;
    const signedPattern = `/storage/v1/object/sign/${bucketName}/`;
    
    let pathStart = url.indexOf(publicPattern);
    if (pathStart !== -1) {
      return decodeURIComponent(url.substring(pathStart + publicPattern.length).split('?')[0]);
    }
    
    pathStart = url.indexOf(signedPattern);
    if (pathStart !== -1) {
      return decodeURIComponent(url.substring(pathStart + signedPattern.length).split('?')[0]);
    }
    
    // Not a storage URL
    return null;
  } catch {
    return null;
  }
}

export default StatusMediaRenderer;
