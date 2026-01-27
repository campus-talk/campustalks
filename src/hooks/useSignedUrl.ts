import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SignedUrlResult {
  signedUrl: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to generate signed URLs for private Supabase storage buckets.
 * The chat-attachments bucket is private, so we need signed URLs for access.
 */
export const useSignedUrl = (
  mediaUrl: string | null,
  bucketName: string = 'chat-attachments',
  expiresIn: number = 3600 // 1 hour default
): SignedUrlResult => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaUrl) {
      setSignedUrl(null);
      setLoading(false);
      return;
    }

    const generateSignedUrl = async () => {
      setLoading(true);
      setError(null);

      try {
        // Extract the storage path from the public URL
        // Format: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
        const storagePath = extractStoragePath(mediaUrl, bucketName);
        
        if (!storagePath) {
          // If it's not a Supabase storage URL, use it directly (might be external)
          setSignedUrl(mediaUrl);
          setLoading(false);
          return;
        }

        const { data, error: signError } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(storagePath, expiresIn);

        if (signError) {
          console.error('Signed URL error:', signError);
          setError(signError.message);
          setSignedUrl(null);
        } else {
          setSignedUrl(data.signedUrl);
        }
      } catch (err: any) {
        console.error('Error generating signed URL:', err);
        setError(err.message);
        setSignedUrl(null);
      } finally {
        setLoading(false);
      }
    };

    generateSignedUrl();
  }, [mediaUrl, bucketName, expiresIn]);

  return { signedUrl, loading, error };
};

/**
 * Utility function to generate a signed URL for a given media URL.
 * Use this for batch operations or when you need a one-time URL.
 */
export const getSignedMediaUrl = async (
  mediaUrl: string | null,
  bucketName: string = 'chat-attachments',
  expiresIn: number = 3600
): Promise<string | null> => {
  if (!mediaUrl) return null;

  try {
    const storagePath = extractStoragePath(mediaUrl, bucketName);
    
    if (!storagePath) {
      // Not a Supabase storage URL, return as-is
      return mediaUrl;
    }

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error('Failed to create signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Error in getSignedMediaUrl:', err);
    return null;
  }
};

/**
 * Extract the storage path from a Supabase public URL.
 */
function extractStoragePath(url: string, bucketName: string): string | null {
  try {
    // Pattern: .../storage/v1/object/public/<bucket>/<path>
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
    
    // Check if it's just a path (already extracted)
    if (!url.startsWith('http')) {
      return url;
    }
    
    return null;
  } catch {
    return null;
  }
}
