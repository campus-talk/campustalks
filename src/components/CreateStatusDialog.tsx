import { useState, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Image, Type, X, Loader2, Video, Camera, ChevronLeft, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface CreateStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onStatusCreated: () => void;
}

const BACKGROUND_COLORS = [
  "#667eea", // Royal blue
  "#764ba2", // Purple
  "#f97316", // Orange
  "#ec4899", // Pink
  "#10b981", // Green
  "#3b82f6", // Blue
  "#ef4444", // Red
  "#000000", // Black
];

const MAX_VIDEO_DURATION = 15; // 15 seconds max

const CreateStatusDialog = ({
  open,
  onOpenChange,
  userId,
  onStatusCreated,
}: CreateStatusDialogProps) => {
  const { toast } = useToast();
  const [step, setStep] = useState<"select" | "preview">("select");
  const [mode, setMode] = useState<"text" | "image" | "video">("text");
  const [content, setContent] = useState("");
  const [selectedColor, setSelectedColor] = useState(BACKGROUND_COLORS[0]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    
    if (isVideo) {
      // Check video duration
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        if (video.duration > MAX_VIDEO_DURATION) {
          toast({
            variant: "destructive",
            title: "Video too long",
            description: `Maximum video duration is ${MAX_VIDEO_DURATION} seconds. Your video is ${Math.round(video.duration)} seconds.`,
          });
          return;
        }
        setVideoDuration(video.duration);
        setMediaFile(file);
        setMediaPreview(URL.createObjectURL(file));
        setMode("video");
        setStep("preview");
      };
      video.src = URL.createObjectURL(file);
    } else {
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
      setMode("image");
      setStep("preview");
    }
  };

  const handleTextMode = () => {
    setMode("text");
    setStep("preview");
  };

  const handleSubmit = async () => {
    if (mode === "text" && !content.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter some text for your status",
      });
      return;
    }

    if ((mode === "image" || mode === "video") && !mediaFile) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a media file",
      });
      return;
    }

    setLoading(true);

    try {
      let mediaUrl = null;

      if (mediaFile) {
        const fileExt = mediaFile.name.split(".").pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(fileName, mediaFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("chat-attachments")
          .getPublicUrl(fileName);

        mediaUrl = publicUrl;
      }

      const { error } = await supabase.from("statuses").insert({
        user_id: userId,
        content: mode === "text" ? content : null,
        media_url: mediaUrl,
        media_type: mode,
        background_color: mode === "text" ? selectedColor : null,
      });

      if (error) throw error;

      toast({
        title: "Status posted!",
        description: "Your status will be visible for 24 hours",
      });

      onStatusCreated();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setContent("");
    setSelectedColor(BACKGROUND_COLORS[0]);
    setMediaFile(null);
    setMediaPreview(null);
    setMode("text");
    setStep("select");
    setVideoDuration(0);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 h-[90vh] max-h-[700px] overflow-hidden bg-black border-0">
        <AnimatePresence mode="wait">
          {step === "select" ? (
            <motion.div
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <button onClick={handleClose} className="text-white/70 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
                <h2 className="text-white font-semibold">Create Status</h2>
                <div className="w-6" />
              </div>

              {/* Options */}
              <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
                <button
                  onClick={handleTextMode}
                  className="w-full max-w-xs flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:opacity-90 transition-opacity"
                >
                  <Type className="w-8 h-8" />
                  <div className="text-left">
                    <p className="font-semibold">Text Status</p>
                    <p className="text-sm text-white/70">Share your thoughts</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = "image/*";
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full max-w-xs flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-pink-600 to-orange-500 text-white hover:opacity-90 transition-opacity"
                >
                  <Image className="w-8 h-8" />
                  <div className="text-left">
                    <p className="font-semibold">Photo Status</p>
                    <p className="text-sm text-white/70">Share a photo</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = "video/*";
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full max-w-xs flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-green-600 to-teal-500 text-white hover:opacity-90 transition-opacity"
                >
                  <Video className="w-8 h-8" />
                  <div className="text-left">
                    <p className="font-semibold">Video Status</p>
                    <p className="text-sm text-white/70">Max {MAX_VIDEO_DURATION} seconds</p>
                  </div>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleMediaSelect}
                  className="hidden"
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="h-full flex flex-col"
            >
              {/* Header */}
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4">
                <button
                  onClick={() => setStep("select")}
                  className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-white rounded-full px-6"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Post
                    </>
                  )}
                </Button>
              </div>

              {/* Preview Area */}
              <div
                className={cn(
                  "flex-1 flex items-center justify-center overflow-hidden",
                  mode === "text" && "p-8"
                )}
                style={{
                  backgroundColor: mode === "text" ? selectedColor : "#000",
                }}
              >
                {mode === "text" ? (
                  <Textarea
                    placeholder="What's on your mind?"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="bg-transparent border-none text-white text-center text-2xl font-medium placeholder:text-white/50 resize-none h-48 focus-visible:ring-0"
                    maxLength={250}
                    autoFocus
                  />
                ) : mode === "video" && mediaPreview ? (
                  <video
                    ref={videoRef}
                    src={mediaPreview}
                    className="max-w-full max-h-full object-contain"
                    controls
                    autoPlay
                    muted
                    loop
                  />
                ) : mediaPreview ? (
                  <img
                    src={mediaPreview}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : null}
              </div>

              {/* Color Picker for Text Mode */}
              {mode === "text" && (
                <div className="absolute bottom-6 left-0 right-0">
                  <div className="flex gap-3 justify-center px-4">
                    {BACKGROUND_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={cn(
                          "w-10 h-10 rounded-full border-2 transition-all shadow-lg",
                          selectedColor === color
                            ? "border-white scale-125"
                            : "border-white/30"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Video Duration Indicator */}
              {mode === "video" && videoDuration > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
                  {Math.round(videoDuration)}s / {MAX_VIDEO_DURATION}s
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default CreateStatusDialog;