import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

interface VoiceMessagePlayerProps {
  /** The storage URL of the voice message */
  mediaUrl: string;
  /** Message ID for tracking */
  messageId: string;
  /** Whether this is a sent message (sender's side) */
  isSent: boolean;
  /** Current user ID */
  currentUserId: string;
  /** Sender ID of the message */
  senderId: string;
  /** Duration in seconds (from message content metadata) */
  duration?: number;
}

const VoiceMessagePlayer = ({
  mediaUrl,
  messageId,
  isSent,
  currentUserId,
  senderId,
  duration: initialDuration = 0,
}: VoiceMessagePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [loading, setLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localBlobUrlRef = useRef<string | null>(null);

  // Generate signed URL and cache locally
  useEffect(() => {
    loadAudio();
    return () => {
      if (localBlobUrlRef.current) {
        URL.revokeObjectURL(localBlobUrlRef.current);
      }
    };
  }, [mediaUrl]);

  const loadAudio = async () => {
    if (!mediaUrl) return;
    setLoading(true);

    try {
      // Handle storage:// protocol (private bucket path)
      const storagePrefix = "storage://chat-attachments/";
      let storagePath: string | null = null;

      if (mediaUrl.startsWith(storagePrefix)) {
        storagePath = mediaUrl.substring(storagePrefix.length);
      } else {
        // Try extracting from full URL
        const bucketName = "chat-attachments";
        const publicPattern = `/storage/v1/object/public/${bucketName}/`;
        const pathStart = mediaUrl.indexOf(publicPattern);
        if (pathStart !== -1) {
          storagePath = decodeURIComponent(
            mediaUrl.substring(pathStart + publicPattern.length).split("?")[0]
          );
        }
      }

      if (storagePath) {
        const { data, error } = await supabase.storage
          .from("chat-attachments")
          .createSignedUrl(storagePath, 3600);

        if (error) {
          console.error("Signed URL error:", error);
          setLoading(false);
          return;
        }

        // Download and cache as blob for local persistence
        try {
          const response = await fetch(data.signedUrl);
          const blob = await response.blob();
          const localUrl = URL.createObjectURL(blob);
          localBlobUrlRef.current = localUrl;
          setAudioUrl(localUrl);
        } catch {
          setAudioUrl(data.signedUrl);
        }
      } else if (mediaUrl.startsWith("blob:")) {
        // Local blob URL (optimistic message)
        setAudioUrl(mediaUrl);
      } else {
        setAudioUrl(mediaUrl);
      }
    } catch (err) {
      console.error("Failed to load audio:", err);
      setAudioUrl(mediaUrl);
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = useCallback(async () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);

        // If receiver plays for first time, delete from storage
        if (!hasPlayed && senderId !== currentUserId) {
          setHasPlayed(true);
          deleteFromStorage();
        }
      } catch (err) {
        console.error("Playback error:", err);
      }
    }
  }, [isPlaying, audioUrl, hasPlayed, senderId, currentUserId]);

  const deleteFromStorage = async () => {
    try {
      let storagePath: string | null = null;
      const storagePrefix = "storage://chat-attachments/";

      if (mediaUrl.startsWith(storagePrefix)) {
        storagePath = mediaUrl.substring(storagePrefix.length);
      } else {
        const bucketName = "chat-attachments";
        const publicPattern = `/storage/v1/object/public/${bucketName}/`;
        const pathStart = mediaUrl.indexOf(publicPattern);
        if (pathStart !== -1) {
          storagePath = decodeURIComponent(
            mediaUrl.substring(pathStart + publicPattern.length).split("?")[0]
          );
        }
      }

      if (storagePath) {
        const { error } = await supabase.storage
          .from("chat-attachments")
          .remove([storagePath]);

        if (error) {
          console.error("Failed to delete voice from storage:", error);
        }
      }
    } catch (err) {
      console.error("Storage cleanup error:", err);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration !== Infinity) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 min-w-[180px] max-w-[260px]">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
      )}

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        disabled={loading || !audioUrl}
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
          isSent
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-primary/10 hover:bg-primary/20 text-primary"
        }`}
      >
        {loading ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className={`w-5 h-5 border-2 rounded-full ${
              isSent ? "border-white/30 border-t-white" : "border-primary/30 border-t-primary"
            }`}
          />
        ) : isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform / Progress */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-[1px] h-6">
          {Array.from({ length: 30 }).map((_, i) => {
            const barProgress = (i / 30) * 100;
            const isActive = barProgress <= progress;
            // Generate pseudo-random heights for waveform look
            const height = 4 + ((Math.sin(i * 1.5) + 1) * 8) + ((i % 3) * 2);
            return (
              <div
                key={i}
                className={`w-[2px] rounded-full transition-colors ${
                  isActive
                    ? isSent
                      ? "bg-white"
                      : "bg-primary"
                    : isSent
                    ? "bg-white/30"
                    : "bg-primary/20"
                }`}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>
        <span
          className={`text-[10px] ${
            isSent ? "text-white/60" : "text-muted-foreground"
          }`}
        >
          {isPlaying || currentTime > 0
            ? formatTime(currentTime)
            : formatTime(duration)}
        </span>
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;
