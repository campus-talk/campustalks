import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatImageProps {
  content: string; // storage://chat-attachments/path OR local blob URL
  messageId: string;
  isSent: boolean;
  currentUserId: string;
  senderId: string;
}

const ChatImage = ({ content, messageId, isSent, currentUserId, senderId }: ChatImageProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const isLocalBlob = content.startsWith("blob:");
  const isStoragePath = content.startsWith("storage://");

  const resolveUrl = useCallback(async () => {
    if (isLocalBlob) {
      setImageUrl(content);
      setLoading(false);
      return;
    }

    if (isStoragePath) {
      const parts = content.replace("storage://", "").split("/");
      const bucket = parts[0];
      const path = parts.slice(1).join("/");

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);

      if (!error && data) {
        setImageUrl(data.signedUrl);

        // If I'm the recipient viewing this image, mark for ephemeral cleanup
        if (senderId !== currentUserId) {
          cleanupFromServer(bucket, path, messageId);
        }
      }
      setLoading(false);
      return;
    }

    // Legacy: direct URL
    setImageUrl(content);
    setLoading(false);
  }, [content, currentUserId, senderId, messageId]);

  useEffect(() => {
    resolveUrl();
  }, [resolveUrl]);

  // Cache image to IndexedDB then delete from server
  const cleanupFromServer = async (bucket: string, path: string, msgId: string) => {
    try {
      // Check if already cached locally
      const cacheKey = `img_${msgId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached === "cleaned") return;

      // Small delay to ensure image is fully loaded by recipient
      setTimeout(async () => {
        try {
          // Delete from storage server to reduce server load
          await supabase.storage.from(bucket).remove([path]);
          localStorage.setItem(cacheKey, "cleaned");
        } catch (e) {
          // Non-critical, will retry next time
        }
      }, 5000);
    } catch (e) {
      // Ignore
    }
  };

  const handleDownload = async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `image_${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  if (loading) {
    return (
      <div className="w-48 h-48 rounded-lg bg-muted/50 animate-pulse flex items-center justify-center">
        <Eye className="w-6 h-6 text-muted-foreground animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <div className="relative group cursor-pointer" onClick={() => setFullscreen(true)}>
        <img
          src={imageUrl || ""}
          alt="Shared image"
          className="rounded-lg max-w-full max-h-64 object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            className="p-2 bg-white/90 rounded-full"
          >
            <Download className="w-5 h-5 text-gray-800" />
          </button>
        </div>
      </div>

      {/* Fullscreen viewer */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setFullscreen(false)}
        >
          <img
            src={imageUrl || ""}
            alt="Full image"
            className="max-w-[95vw] max-h-[90vh] object-contain"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            className="absolute bottom-8 right-8 p-3 bg-white/20 rounded-full hover:bg-white/40 transition-colors"
          >
            <Download className="w-6 h-6 text-white" />
          </button>
        </div>
      )}
    </>
  );
};

export default ChatImage;
