import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, Eye, ImageOff, RefreshCw } from "lucide-react";

interface ChatImageProps {
  content: string; // storage://chat-attachments/path OR local blob URL OR public URL
  messageId: string;
  isSent: boolean;
  currentUserId: string;
  senderId: string;
}

const ChatImage = ({ content, messageId, isSent, currentUserId, senderId }: ChatImageProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const resolveUrl = useCallback(async () => {
    setLoading(true);
    setError(null);
    setImgLoaded(false);

    try {
      // Local blob URL (optimistic preview)
      if (content.startsWith("blob:")) {
        setImageUrl(content);
        setLoading(false);
        return;
      }

      // storage:// protocol -> generate signed URL
      if (content.startsWith("storage://")) {
        const parts = content.replace("storage://", "").split("/");
        const bucket = parts[0];
        const path = parts.slice(1).join("/");

        const { data, error: signError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 3600);

        if (signError || !data?.signedUrl) {
          console.error("ChatImage signed URL error:", signError);
          // Fallback: try public URL
          const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
          if (publicData?.publicUrl) {
            setImageUrl(publicData.publicUrl);
          } else {
            setError("Image not available");
          }
          setLoading(false);
          return;
        }

        setImageUrl(data.signedUrl);

        // Ephemeral cleanup: if recipient views, delete from server after caching
        if (senderId !== currentUserId) {
          scheduleCleanup(bucket, path, messageId);
        }

        setLoading(false);
        return;
      }

      // Direct URL (legacy or external)
      if (content.startsWith("http")) {
        setImageUrl(content);
        setLoading(false);
        return;
      }

      // Unknown format
      setError("Unsupported image format");
      setLoading(false);
    } catch (e: any) {
      console.error("ChatImage resolve error:", e);
      setError(e.message || "Failed to load image");
      setLoading(false);
    }
  }, [content, currentUserId, senderId, messageId]);

  useEffect(() => {
    resolveUrl();
  }, [resolveUrl]);

  const scheduleCleanup = (bucket: string, path: string, msgId: string) => {
    const cacheKey = `img_${msgId}`;
    if (localStorage.getItem(cacheKey) === "cleaned") return;

    setTimeout(async () => {
      try {
        await supabase.storage.from(bucket).remove([path]);
        localStorage.setItem(cacheKey, "cleaned");
      } catch {
        // Non-critical
      }
    }, 8000);
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

  // Loading state
  if (loading) {
    return (
      <div className="w-64 h-48 rounded-lg bg-black/20 animate-pulse flex items-center justify-center">
        <Eye className="w-6 h-6 text-white/50 animate-pulse" />
      </div>
    );
  }

  // Error state with retry
  if (error || !imageUrl) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          resolveUrl();
        }}
        className="w-64 h-48 rounded-lg bg-black/20 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-black/30 transition-colors"
      >
        <ImageOff className="w-8 h-8 text-white/50" />
        <span className="text-xs text-white/60">Tap to retry</span>
        <RefreshCw className="w-4 h-4 text-white/40" />
      </div>
    );
  }

  return (
    <>
      <div
        className="relative group cursor-pointer w-64 h-48 flex justify-center items-center rounded-lg overflow-hidden bg-muted/50"
        onClick={() => setFullscreen(true)}
      >
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Eye className="w-10 h-10 text-white/50 animate-pulse" />
          </div>
        )}
        <img
          src={imageUrl}
          alt="Chat attachment"
          className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgLoaded(false);
            setError("Failed to load");
          }}
        />
        {imgLoaded && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Eye className="w-8 h-8 text-white" />
          </div>
        )}
      </div>

      {/* Fullscreen viewer */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setFullscreen(false)}
        >
          <img
            src={imageUrl}
            alt="Chat attachment"
            className="max-w-[95vw] max-h-[90vh] object-contain shadow-2xl"
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
