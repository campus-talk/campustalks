import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { X, Eye, Trash2, Volume2, VolumeX, Loader2 } from "lucide-react";
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
  allUserGroups?: { userId: string; statuses: Status[] }[];
  onUserChange?: (userId: string) => void;
}

const STORY_DURATION = 5000; // 5 seconds per story

const StatusViewer = ({
  open,
  onOpenChange,
  statuses,
  initialIndex = 0,
  currentUserId,
  onStatusDeleted,
  allUserGroups,
  onUserChange,
}: StatusViewerProps) => {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  const currentStatus = statuses[currentIndex];
  const isOwnStatus = currentStatus?.user_id === currentUserId;
  const isVideo = currentStatus?.media_type === "video";
  const isImage = currentStatus?.media_type === "image";
  const isText = currentStatus?.media_type === "text";

  // Reset loading state when status changes
  useEffect(() => {
    if (isText) {
      setIsMediaLoaded(true);
      setIsLoading(false);
    } else {
      setIsMediaLoaded(false);
      setIsLoading(true);
    }
  }, [currentIndex, currentStatus?.id, isText]);

  const goToNext = useCallback(() => {
    if (currentIndex < statuses.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
      setIsMediaLoaded(false);
      setIsLoading(true);
    } else {
      // Move to next user's stories if available
      if (allUserGroups && onUserChange) {
        const currentUserIndex = allUserGroups.findIndex(g => 
          g.statuses.some(s => s.id === currentStatus?.id)
        );
        if (currentUserIndex < allUserGroups.length - 1) {
          onUserChange(allUserGroups[currentUserIndex + 1].userId);
          return;
        }
      }
      onOpenChange(false);
    }
  }, [currentIndex, statuses.length, onOpenChange, allUserGroups, onUserChange, currentStatus?.id]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
      setIsMediaLoaded(false);
      setIsLoading(true);
    } else {
      // Move to previous user's stories if available
      if (allUserGroups && onUserChange) {
        const currentUserIndex = allUserGroups.findIndex(g => 
          g.statuses.some(s => s.id === currentStatus?.id)
        );
        if (currentUserIndex > 0) {
          onUserChange(allUserGroups[currentUserIndex - 1].userId);
          return;
        }
      }
    }
  }, [currentIndex, allUserGroups, onUserChange, currentStatus?.id]);

  // Reset index when opening
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setProgress(0);
      setShowViewers(false);
      setIsMediaLoaded(false);
      setIsLoading(true);
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

    if (open && isMediaLoaded) {
      markAsViewed();
    }
  }, [currentStatus, currentUserId, isOwnStatus, open, isMediaLoaded]);

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

  // Auto-progress timer - only starts when media is loaded
  useEffect(() => {
    if (!open || isPaused || !isMediaLoaded) {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
      return;
    }

    // For videos, sync progress with video
    if (isVideo && videoRef.current) {
      const video = videoRef.current;
      
      const updateProgress = () => {
        if (video.duration && isFinite(video.duration)) {
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
    const startTime = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percent = (elapsed / STORY_DURATION) * 100;
      
      if (percent >= 100) {
        goToNext();
      } else {
        setProgress(percent);
      }
    }, 50);

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [open, isPaused, goToNext, isVideo, currentIndex, isMediaLoaded]);

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

  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x: number;
    
    if ('touches' in e) {
      return; // Let touch handlers manage this
    } else {
      x = e.clientX - rect.left;
    }
    
    const width = rect.width;

    if (x < width / 3) {
      goToPrev();
    } else if (x > (width * 2) / 3) {
      goToNext();
    }
  };

  // Touch handlers for swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;
    
    setIsPaused(false);

    // Swipe down to close
    if (deltaY > 100 && Math.abs(deltaX) < 50) {
      onOpenChange(false);
      return;
    }

    // Horizontal tap navigation
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tapX = touchStartX.current - rect.left;
    const width = rect.width;

    if (Math.abs(deltaX) < 30 && Math.abs(deltaY) < 30) {
      // It's a tap, not a swipe
      if (tapX < width / 3) {
        goToPrev();
      } else if (tapX > (width * 2) / 3) {
        goToNext();
      }
    }
  };

  const handleImageLoad = () => {
    setIsMediaLoaded(true);
    setIsLoading(false);
  };

  const handleVideoLoaded = () => {
    setIsMediaLoaded(true);
    setIsLoading(false);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  if (!currentStatus) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full h-full max-w-none max-h-none p-0 m-0 overflow-hidden bg-black border-0 rounded-none sm:rounded-none"
        style={{ 
          width: '100vw', 
          height: '100vh',
          maxWidth: '100vw',
          maxHeight: '100vh',
        }}
      >
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 pt-2 px-2 z-30 safe-area-pt">
          <div className="flex gap-1">
            {statuses.map((_, index) => (
              <div
                key={index}
                className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"
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
                  transition={{ duration: 0.05, ease: "linear" }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="absolute top-4 left-0 right-0 px-3 flex items-center justify-between z-30 safe-area-pt">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="w-10 h-10 border-2 border-white/30 flex-shrink-0">
              <AvatarImage src={currentStatus.profiles.avatar_url || ""} />
              <AvatarFallback className="bg-white/20 text-white text-sm">
                {currentStatus.profiles.full_name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-sm truncate">
                {currentStatus.profiles.full_name}
              </p>
              <p className="text-white/70 text-xs">
                {formatDistanceToNow(new Date(currentStatus.created_at), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isVideo && (
              <button
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (videoRef.current) {
                    videoRef.current.muted = !isMuted;
                  }
                }}
                className="p-2.5 text-white active:bg-white/20 rounded-full transition-colors"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}
            {isOwnStatus && (
              <Button
                variant="ghost"
                size="icon"
                className="text-white active:bg-white/20 h-10 w-10"
                onClick={handleDeleteStatus}
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="p-2.5 text-white active:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Loading indicator */}
        <AnimatePresence>
          {isLoading && !isText && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-20 bg-black"
            >
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
                <p className="text-white/70 text-sm">Loading...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <div
          className={cn(
            "w-full h-full flex items-center justify-center",
            isText && "p-6"
          )}
          style={{
            backgroundColor:
              isText
                ? currentStatus.background_color || "#667eea"
                : "#000",
          }}
          onClick={handleTap}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isVideo && currentStatus.media_url ? (
            <video
              ref={videoRef}
              src={currentStatus.media_url}
              className={cn(
                "w-full h-full object-contain transition-opacity duration-300",
                isLoading ? "opacity-0" : "opacity-100"
              )}
              muted={isMuted}
              playsInline
              loop={false}
              preload="auto"
              onLoadedData={handleVideoLoaded}
              onCanPlay={handleVideoLoaded}
            />
          ) : isImage && currentStatus.media_url ? (
            <img
              src={currentStatus.media_url}
              alt="Status"
              className={cn(
                "w-full h-full object-contain transition-opacity duration-300",
                isLoading ? "opacity-0" : "opacity-100"
              )}
              onLoad={handleImageLoad}
            />
          ) : (
            <motion.p
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-white text-xl sm:text-2xl font-medium text-center leading-relaxed px-4"
            >
              {currentStatus.content}
            </motion.p>
          )}
        </div>

        {/* Story navigation dots - only show if multiple */}
        {statuses.length > 1 && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex gap-1">
            {statuses.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  idx === currentIndex ? "bg-white w-3" : "bg-white/40"
                )}
              />
            ))}
          </div>
        )}

        {/* Viewers (for own status) */}
        {isOwnStatus && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowViewers(!showViewers);
              setIsPaused(!showViewers);
            }}
            className="absolute bottom-8 left-4 right-4 flex items-center justify-center gap-2 text-white bg-black/50 backdrop-blur-sm px-4 py-3 rounded-2xl z-20 active:bg-black/70 transition-colors safe-area-pb"
          >
            <Eye className="w-5 h-5" />
            <span className="text-sm font-semibold">{viewers.length} views</span>
          </button>
        )}

        <AnimatePresence>
          {showViewers && (
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl max-h-[60%] overflow-hidden z-40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-background pt-3 pb-2 px-4 border-b border-border">
                <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-foreground">Viewed by</h4>
                  <button
                    onClick={() => {
                      setShowViewers(false);
                      setIsPaused(false);
                    }}
                    className="p-2 -mr-2 text-muted-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto max-h-[calc(60vh-80px)] p-4">
                {viewers.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No views yet</p>
                ) : (
                  <div className="space-y-3">
                    {viewers.map((view) => (
                      <div key={view.id} className="flex items-center gap-3">
                        <Avatar className="w-11 h-11">
                          <AvatarImage src={view.profiles?.avatar_url || ""} />
                          <AvatarFallback className="bg-muted text-foreground">
                            {view.profiles?.full_name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-foreground font-medium flex-1">
                          {view.profiles?.full_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(view.viewed_at), { addSuffix: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default StatusViewer;
