import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { X, ChevronLeft, ChevronRight, Eye, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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

  const currentStatus = statuses[currentIndex];
  const isOwnStatus = currentStatus?.user_id === currentUserId;

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
    if (!open || isPaused) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          goToNext();
          return 0;
        }
        return prev + 2;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [open, isPaused, goToNext]);

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

  if (!currentStatus) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 h-[85vh] max-h-[700px] overflow-hidden"
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
              <div
                className="h-full bg-white transition-all"
                style={{
                  width:
                    index < currentIndex
                      ? "100%"
                      : index === currentIndex
                      ? `${progress}%`
                      : "0%",
                }}
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
            "w-full h-full flex items-center justify-center",
            currentStatus.media_type === "text" && "p-8"
          )}
          style={{
            backgroundColor:
              currentStatus.media_type === "text"
                ? currentStatus.background_color || "#0ea5a9"
                : "#000",
          }}
        >
          {currentStatus.media_type === "image" && currentStatus.media_url ? (
            <img
              src={currentStatus.media_url}
              alt="Status"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <p className="text-white text-xl font-medium text-center">
              {currentStatus.content}
            </p>
          )}
        </div>

        {/* Navigation */}
        <button
          onClick={goToPrev}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white"
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
        <button
          onClick={goToNext}
          className="absolute right-0 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white"
        >
          <ChevronRight className="w-8 h-8" />
        </button>

        {/* Viewers (for own status) */}
        {isOwnStatus && (
          <button
            onClick={() => setShowViewers(!showViewers)}
            className="absolute bottom-4 left-4 flex items-center gap-2 text-white bg-black/30 px-3 py-2 rounded-full"
          >
            <Eye className="w-4 h-4" />
            <span className="text-sm">{viewers.length}</span>
          </button>
        )}

        {showViewers && (
          <div className="absolute bottom-16 left-4 right-4 bg-background/95 rounded-xl p-4 max-h-48 overflow-y-auto">
            <h4 className="font-medium mb-2 text-foreground">Viewed by</h4>
            {viewers.length === 0 ? (
              <p className="text-muted-foreground text-sm">No views yet</p>
            ) : (
              <div className="space-y-2">
                {viewers.map((view) => (
                  <div key={view.id} className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={view.profiles?.avatar_url || ""} />
                      <AvatarFallback>
                        {view.profiles?.full_name?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground">
                      {view.profiles?.full_name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StatusViewer;
