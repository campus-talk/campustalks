import { useState, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Image, Type, X, Loader2, Video, ChevronLeft, Send, Camera } from "lucide-react";
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
  "#1f2937", // Dark gray
  "#7c3aed", // Violet
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
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    
    if (isVideo) {
      // Check video duration with proper loading
      const video = document.createElement("video");
      video.preload = "metadata";
      const objectUrl = URL.createObjectURL(file);
      
      video.onloadeddata = () => {
        // Wait for video to be fully loaded before checking duration
        const duration = video.duration;
        
        // Check if duration is valid (not NaN or Infinity)
        if (!isFinite(duration) || isNaN(duration)) {
          // If duration is not available, allow the video (some formats don't report duration)
          setVideoDuration(0);
          setMediaFile(file);
          setMediaPreview(objectUrl);
          setMode("video");
          setStep("preview");
          return;
        }
        
        if (duration > MAX_VIDEO_DURATION) {
          URL.revokeObjectURL(objectUrl);
          toast({
            variant: "destructive",
            title: "Video too long",
            description: `Maximum ${MAX_VIDEO_DURATION} seconds allowed. Your video is ${Math.floor(duration)} seconds.`,
          });
          // Reset file input
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          return;
        }
        
        setVideoDuration(duration);
        setMediaFile(file);
        setMediaPreview(objectUrl);
        setMode("video");
        setStep("preview");
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load video. Please try a different file.",
        });
      };
      
      video.src = objectUrl;
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
      <DialogContent 
        className="w-full h-full max-w-none max-h-none p-0 m-0 overflow-hidden bg-black border-0 rounded-none sm:rounded-none"
        style={{ 
          width: '100vw', 
          height: '100vh',
          maxWidth: '100vw',
          maxHeight: '100vh',
        }}
      >
        <AnimatePresence mode="wait">
          {step === "select" ? (
            <motion.div
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col bg-gradient-to-b from-background to-background/95"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border/30 safe-area-pt">
                <button onClick={handleClose} className="p-2 -ml-2 text-foreground/70 active:text-foreground">
                  <X className="w-6 h-6" />
                </button>
                <h2 className="text-foreground font-semibold text-lg">Add Status</h2>
                <div className="w-10" />
              </div>

              {/* Options */}
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
                <p className="text-muted-foreground text-sm mb-4">What would you like to share?</p>
                
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleTextMode}
                  className="w-full max-w-sm flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground active:opacity-90 transition-opacity shadow-lg"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Type className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-base">Text Status</p>
                    <p className="text-sm opacity-80">Share your thoughts</p>
                  </div>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (cameraInputRef.current) {
                      cameraInputRef.current.click();
                    }
                  }}
                  className="w-full max-w-sm flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white active:opacity-90 transition-opacity shadow-lg"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-base">Camera</p>
                    <p className="text-sm opacity-80">Take a photo now</p>
                  </div>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = "image/*";
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full max-w-sm flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white active:opacity-90 transition-opacity shadow-lg"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Image className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-base">Photo Gallery</p>
                    <p className="text-sm opacity-80">Choose from gallery</p>
                  </div>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = "video/*";
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full max-w-sm flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white active:opacity-90 transition-opacity shadow-lg"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Video className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-base">Video Status</p>
                    <p className="text-sm opacity-80">Max {MAX_VIDEO_DURATION} seconds</p>
                  </div>
                </motion.button>

                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleMediaSelect}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
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
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 safe-area-pt">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setStep("select")}
                  className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white active:bg-black/70"
                >
                  <ChevronLeft className="w-5 h-5" />
                </motion.button>
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 h-10 font-semibold shadow-lg"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Post
                      </>
                    )}
                  </Button>
                </motion.div>
              </div>

              {/* Preview Area */}
              <div
                className={cn(
                  "flex-1 flex items-center justify-center overflow-hidden",
                  mode === "text" && "p-6"
                )}
                style={{
                  backgroundColor: mode === "text" ? selectedColor : "#000",
                }}
              >
                {mode === "text" ? (
                  <div className="w-full max-w-lg">
                    <Textarea
                      placeholder="What's on your mind?"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="bg-transparent border-none text-white text-center text-xl sm:text-2xl font-medium placeholder:text-white/50 resize-none min-h-[200px] focus-visible:ring-0 focus-visible:ring-offset-0"
                      maxLength={250}
                      autoFocus
                    />
                    <p className="text-white/50 text-center text-sm mt-2">
                      {content.length}/250
                    </p>
                  </div>
                ) : mode === "video" && mediaPreview ? (
                  <video
                    ref={videoRef}
                    src={mediaPreview}
                    className="w-full h-full object-contain"
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : mediaPreview ? (
                  <img
                    src={mediaPreview}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                ) : null}
              </div>

              {/* Color Picker for Text Mode */}
              {mode === "text" && (
                <div className="absolute bottom-0 left-0 right-0 pb-8 safe-area-pb">
                  <div className="flex gap-3 justify-center px-4 py-4 overflow-x-auto">
                    {BACKGROUND_COLORS.map((color) => (
                      <motion.button
                        key={color}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setSelectedColor(color)}
                        className={cn(
                          "w-10 h-10 rounded-full border-2 transition-all shadow-lg flex-shrink-0",
                          selectedColor === color
                            ? "border-white scale-110"
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
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium safe-area-pb">
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
