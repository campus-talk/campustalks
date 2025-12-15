import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { X, Eye, Trash2, ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface Status {
  id: string;
  content: string | null;
  media_url: string | null;
  media_type: string;
  background_color: string | null;
  created_at: string;
  user_id: string;
  profiles: {
    full_name: string;
    avatar_url: string | null;
    username: string | null;
  };
}

interface StatusViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: Status[];
  initialIndex?: number;
  currentUserId: string;
  onStatusDeleted?: () => void;
}

const StatusViewer = ({
  open,
  onOpenChange,
  statuses,
  initialIndex = 0,
  currentUserId,
  onStatusDeleted,
}: StatusViewerProps) => {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  const currentStatus = statuses[currentIndex];
  const isOwnStatus = currentStatus?.user_id === currentUserId;
  const isVideo = currentStatus?.media_type === "video";

  const goToNext = useCallback(() => {
    if (currentIndex < statuses.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      onOpenChange(false);
    }
  }, [currentIndex, statuses.length, onOpenChange]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  // Reset index when opening
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setProgress(0);
      setShowViewers(false);
    }
  }, [open, initialIndex]);

  // Mark status as viewed
  useEffect(() => {
    const markAsViewed = async () => {
      if (!currentStatus || isOwnStatus) return;

      await supabase.from("status_views").upsert(
        {
          status_id: currentStatus.id,
          viewer_id: currentUserId,
        },
        { onConflict: "status_id,viewer_id" }
      );
    };

    if (open) {
      markAsViewed();
    }
  }, [currentStatus, currentUserId, isOwnStatus, open]);

  // Load viewers for own status
  useEffect(() => {
    const loadViewers = async () => {
      if (!currentStatus || !isOwnStatus) return;

      const { data } = await supabase
        .from("status_views")
        .select("*, profiles:viewer_id(full_name, avatar_url)")
        .eq("status_id", currentStatus.id);

      if (data) {
        setViewers(data);
      }
    };

    if (open && isOwnStatus) {
      loadViewers();
    }
  }, [currentStatus, isOwnStatus, open]);

  // Auto-progress timer
  useEffect(() => {
    if (!open || isPaused) {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
      return;
    }

    // For videos, sync progress with video
    if (isVideo && videoRef.current) {
      const video = videoRef.current;
      
      const updateProgress = () => {
        if (video.duration) {
          const percent = (video.currentTime / video.duration) * 100;
          setProgress(percent);
          if (percent >= 100) {
            goToNext();
          }
        }
      };

      video.addEventListener("timeupdate", updateProgress);
      video.addEventListener("ended", goToNext);

      return () => {
        video.removeEventListener("timeupdate", updateProgress);
        video.removeEventListener("ended", goToNext);
      };
    }

    // For images/text, use timer
    progressInterval.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          goToNext();
          return 0;
        }
        return prev + 2;
      });
    }, 100);

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [open, isPaused, goToNext, isVideo, currentIndex]);

  const handleDeleteStatus = async () => {
    if (!currentStatus) return;

    try {
      const { error } = await supabase
        .from("statuses")
        .delete()
        .eq("id", currentStatus.id);

      if (error) throw error;

      toast({
        title: "Status deleted",
        description: "Your status has been removed",
      });

      if (statuses.length === 1) {
        onOpenChange(false);
      } else if (currentIndex === statuses.length - 1) {
        setCurrentIndex((prev) => prev - 1);
      }

      onStatusDeleted?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleTap = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    if (x < width / 3) {
      goToPrev();
    } else if (x > (width * 2) / 3) {
      goToNext();
    }
  };

  if (!currentStatus) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 h-[90vh] max-h-[700px] overflow-hidden bg-black border-0"
        onPointerDown={() => setIsPaused(true)}
        onPointerUp={() => setIsPaused(false)}
      >
        {/* Progress bars */}
        <div className="absolute top-2 left-2 right-2 flex gap-1 z-20">
          {statuses.map((_, index) => (
            <div
              key={index}
              className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden"
            >
              <motion.div
                className="h-full bg-white"
                initial={{ width: index < currentIndex ? "100%" : "0%" }}
                animate={{
                  width:
                    index < currentIndex
                      ? "100%"
                      : index === currentIndex
                      ? `${progress}%`
                      : "0%",
                }}
                transition={{ duration: 0.1 }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 left-2 right-2 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <Avatar className="w-10 h-10 border-2 border-white/30">
              <AvatarImage src={currentStatus.profiles.avatar_url || ""} />
              <AvatarFallback className="bg-white/20 text-white">
                {currentStatus.profiles.full_name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white font-medium text-sm">
                {currentStatus.profiles.full_name}
              </p>
              <p className="text-white/70 text-xs">
                {formatDistanceToNow(new Date(currentStatus.created_at), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isVideo && (
              <button
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (videoRef.current) {
                    videoRef.current.muted = !isMuted;
                  }
                }}
                className="p-2 text-white hover:bg-white/20 rounded-full"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}
            {isOwnStatus && (
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={handleDeleteStatus}
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 text-white hover:bg-white/20 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          className={cn(
            "w-full h-full flex items-center justify-center cursor-pointer",
            currentStatus.media_type === "text" && "p-8"
          )}
          style={{
            backgroundColor:
              currentStatus.media_type === "text"
                ? currentStatus.background_color || "#667eea"
                : "#000",
          }}
          onClick={handleTap}
        >
          {currentStatus.media_type === "video" && currentStatus.media_url ? (
            <video
              ref={videoRef}
              src={currentStatus.media_url}
              className="max-w-full max-h-full object-contain"
              autoPlay
              muted={isMuted}
              playsInline
              loop={false}
            />
          ) : currentStatus.media_type === "image" && currentStatus.media_url ? (
            <img
              src={currentStatus.media_url}
              alt="Status"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <p className="text-white text-2xl font-medium text-center leading-relaxed">
              {currentStatus.content}
            </p>
          )}
        </div>

        {/* Navigation hints */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 p-2 pointer-events-none">
          {currentIndex > 0 && (
            <ChevronLeft className="w-8 h-8 text-white/30" />
          )}
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 p-2 pointer-events-none">
          {currentIndex < statuses.length - 1 && (
            <ChevronRight className="w-8 h-8 text-white/30" />
          )}
        </div>

        {/* Viewers (for own status) */}
        {isOwnStatus && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowViewers(!showViewers);
            }}
            className="absolute bottom-4 left-4 flex items-center gap-2 text-white bg-black/50 px-4 py-2 rounded-full z-20"
          >
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">{viewers.length} views</span>
          </button>
        )}

        <AnimatePresence>
          {showViewers && (
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="absolute bottom-0 left-0 right-0 bg-background/95 rounded-t-3xl p-4 max-h-[50%] overflow-y-auto z-30"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
              <h4 className="font-semibold mb-4 text-foreground">Viewed by</h4>
              {viewers.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No views yet</p>
              ) : (
                <div className="space-y-3">
                  {viewers.map((view) => (
                    <div key={view.id} className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={view.profiles?.avatar_url || ""} />
                        <AvatarFallback>
                          {view.profiles?.full_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-foreground font-medium">
                        {view.profiles?.full_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default StatusViewer;