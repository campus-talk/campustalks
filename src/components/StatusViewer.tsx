import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { X, Eye, Trash2, Volume2, VolumeX, Heart, Send, ChevronUp, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import StatusMediaRenderer from "./status/StatusMediaRenderer";

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

const STORY_DURATION = 5000;

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
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [replyText, setReplyText] = useState("");
  const [showReplyInput, setShowReplyInput] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  const currentStatus = statuses[currentIndex];
  const isOwnStatus = currentStatus?.user_id === currentUserId;
  const isVideo = currentStatus?.media_type === "video";
  const isImage = currentStatus?.media_type === "image";
  const isText = currentStatus?.media_type === "text";

  // Load like status
  useEffect(() => {
    const loadLikeStatus = async () => {
      if (!currentStatus || !open) return;
      
      const { data: likes, count } = await supabase
        .from("status_likes")
        .select("*", { count: "exact" })
        .eq("status_id", currentStatus.id);
      
      setLikeCount(count || 0);
      setIsLiked(likes?.some(l => l.user_id === currentUserId) || false);
    };
    
    loadLikeStatus();
  }, [currentStatus?.id, currentUserId, open]);

  const handleLike = async () => {
    if (!currentStatus) return;
    
    if (isLiked) {
      await supabase
        .from("status_likes")
        .delete()
        .eq("status_id", currentStatus.id)
        .eq("user_id", currentUserId);
      setIsLiked(false);
      setLikeCount(prev => prev - 1);
    } else {
      await supabase
        .from("status_likes")
        .insert({ status_id: currentStatus.id, user_id: currentUserId });
      setIsLiked(true);
      setLikeCount(prev => prev + 1);
    }
  };

  const handleReply = async () => {
    if (!currentStatus || !replyText.trim()) return;
    
    try {
      await supabase.from("status_replies").insert({
        status_id: currentStatus.id,
        user_id: currentUserId,
        message: replyText.trim(),
      });
      
      toast({ title: "Reply sent!" });
      setReplyText("");
      setShowReplyInput(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to send reply" });
    }
  };

  const goToNext = useCallback(() => {
    if (currentIndex < statuses.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
      setIsMediaReady(false);
    } else {
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
      setIsMediaReady(false);
    } else {
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

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setProgress(0);
      setShowViewers(false);
      setIsMediaReady(false);
      setShowReplyInput(false);
    }
  }, [open, initialIndex]);

  // Mark status as viewed
  useEffect(() => {
    const markAsViewed = async () => {
      if (!currentStatus || isOwnStatus) return;
      await supabase.from("status_views").upsert(
        { status_id: currentStatus.id, viewer_id: currentUserId },
        { onConflict: "status_id,viewer_id" }
      );
    };
    if (open && isMediaReady) markAsViewed();
  }, [currentStatus, currentUserId, isOwnStatus, open, isMediaReady]);

  // Load viewers for own status
  useEffect(() => {
    const loadViewers = async () => {
      if (!currentStatus || !isOwnStatus) return;
      const { data } = await supabase
        .from("status_views")
        .select("*, profiles:viewer_id(full_name, avatar_url)")
        .eq("status_id", currentStatus.id);
      if (data) setViewers(data);
    };
    if (open && isOwnStatus) loadViewers();
  }, [currentStatus, isOwnStatus, open]);

  // Progress timer - only starts when media is ready
  useEffect(() => {
    if (!open || isPaused || !isMediaReady || showReplyInput) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      return;
    }

    // For videos, use video time progress
    if (isVideo && videoRef.current) {
      const video = videoRef.current;
      const updateProgress = () => {
        if (video.duration && isFinite(video.duration)) {
          const percent = (video.currentTime / video.duration) * 100;
          setProgress(percent);
          if (percent >= 100) goToNext();
        }
      };
      video.addEventListener("timeupdate", updateProgress);
      video.addEventListener("ended", goToNext);
      return () => {
        video.removeEventListener("timeupdate", updateProgress);
        video.removeEventListener("ended", goToNext);
      };
    }

    // For images/text, use fixed timer
    const startTime = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percent = (elapsed / STORY_DURATION) * 100;
      if (percent >= 100) goToNext();
      else setProgress(percent);
    }, 50);

    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [open, isPaused, goToNext, isVideo, currentIndex, isMediaReady, showReplyInput]);

  const handleDeleteStatus = async () => {
    if (!currentStatus) return;
    try {
      const { error } = await supabase.from("statuses").delete().eq("id", currentStatus.id);
      if (error) throw error;
      toast({ title: "Status deleted" });
      if (statuses.length === 1) onOpenChange(false);
      else if (currentIndex === statuses.length - 1) setCurrentIndex((prev) => prev - 1);
      onStatusDeleted?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleTap = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    if (x < width / 3) goToPrev();
    else if (x > (width * 2) / 3) goToNext();
  };

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

    if (deltaY > 100 && Math.abs(deltaX) < 50) {
      onOpenChange(false);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tapX = touchStartX.current - rect.left;
    const width = rect.width;

    if (Math.abs(deltaX) < 30 && Math.abs(deltaY) < 30) {
      if (tapX < width / 3) goToPrev();
      else if (tapX > (width * 2) / 3) goToNext();
    }
  };

  const handleMediaReady = useCallback(() => {
    setIsMediaReady(true);
  }, []);

  const handleMediaError = useCallback(() => {
    // On error, still mark as "ready" but show error state
    // This prevents infinite loading
    setIsMediaReady(true);
  }, []);

  if (!currentStatus) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full h-full max-w-none max-h-none p-0 m-0 overflow-hidden bg-black border-0 rounded-none"
        style={{ width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh' }}
      >
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 pt-2 px-2 z-30 safe-area-pt">
          <div className="flex gap-1">
            {statuses.map((_, index) => (
              <div key={index} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white"
                  initial={{ width: index < currentIndex ? "100%" : "0%" }}
                  animate={{
                    width: index < currentIndex ? "100%" : index === currentIndex ? `${progress}%` : "0%",
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
            <Avatar className="w-10 h-10 border-2 border-white/30">
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
                {formatDistanceToNow(new Date(currentStatus.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isVideo && (
              <button
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (videoRef.current) videoRef.current.muted = !isMuted;
                }}
                className="p-2.5 text-white active:bg-white/20 rounded-full"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}
            {isOwnStatus && (
              <Button variant="ghost" size="icon" className="text-white h-10 w-10" onClick={handleDeleteStatus}>
                <Trash2 className="w-5 h-5" />
              </Button>
            )}
            <button onClick={() => onOpenChange(false)} className="p-2.5 text-white rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content with StatusMediaRenderer */}
        <div
          className={cn("w-full h-full flex items-center justify-center", isText && "p-6")}
          style={{ backgroundColor: isText ? currentStatus.background_color || "#667eea" : "#000" }}
          onClick={handleTap}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <StatusMediaRenderer
            key={currentStatus.id} // Force remount on status change
            mediaUrl={currentStatus.media_url}
            mediaType={currentStatus.media_type as 'image' | 'video' | 'text'}
            content={currentStatus.content}
            backgroundColor={currentStatus.background_color}
            onMediaReady={handleMediaReady}
            onMediaError={handleMediaError}
            isMuted={isMuted}
            videoRef={videoRef}
          />
          
          {/* Text overlay on image */}
          {isImage && currentStatus.content && isMediaReady && (
            <div className="absolute bottom-32 left-4 right-4 z-20">
              <p className="text-white text-lg font-medium text-center drop-shadow-lg bg-black/30 rounded-lg p-3">
                {currentStatus.content}
              </p>
            </div>
          )}
        </div>

        {/* Bottom actions - Like and Reply */}
        {!isOwnStatus && (
          <div className="absolute bottom-6 left-0 right-0 z-30 px-4 safe-area-pb">
            <AnimatePresence>
              {showReplyInput ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full p-2"
                >
                  <Input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Reply..."
                    className="flex-1 bg-transparent border-0 text-white placeholder:text-white/50 focus-visible:ring-0"
                    autoFocus
                  />
                  <Button
                    size="icon"
                    className="rounded-full bg-primary hover:bg-primary/90 w-10 h-10"
                    onClick={handleReply}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="rounded-full text-white w-10 h-10"
                    onClick={() => setShowReplyInput(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center gap-6"
                >
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={handleLike}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                      isLiked ? "bg-red-500" : "bg-white/20 backdrop-blur-sm"
                    )}>
                      <Heart className={cn("w-6 h-6", isLiked ? "text-white fill-white" : "text-white")} />
                    </div>
                    {likeCount > 0 && <span className="text-white text-xs">{likeCount}</span>}
                  </motion.button>
                  
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowReplyInput(true)}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <Send className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-white text-xs">Reply</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Viewers for own status */}
        {isOwnStatus && (
          <div className="absolute bottom-6 left-0 right-0 z-30 safe-area-pb">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowViewers(!showViewers)}
              className="mx-auto flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-5 py-3 text-white"
            >
              <Eye className="w-5 h-5" />
              <span className="font-medium">{viewers.length} views</span>
              {showViewers ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </motion.button>
            
            <AnimatePresence>
              {showViewers && viewers.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mx-4 mt-3 bg-black/60 backdrop-blur-md rounded-2xl overflow-hidden max-h-48 overflow-y-auto"
                >
                  {viewers.map((viewer) => (
                    <div key={viewer.id} className="flex items-center gap-3 p-3 border-b border-white/10 last:border-0">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={viewer.profiles?.avatar_url || ""} />
                        <AvatarFallback className="bg-white/20 text-white text-xs">
                          {viewer.profiles?.full_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-white text-sm">{viewer.profiles?.full_name}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StatusViewer;
