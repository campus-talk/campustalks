import { useState, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Image, Type, X, Loader2, Video, ChevronLeft, Send, Camera, Plus, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface CreateStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onStatusCreated: () => void;
}

const BACKGROUND_COLORS = [
  "#667eea", "#764ba2", "#f97316", "#ec4899", "#10b981",
  "#3b82f6", "#ef4444", "#000000", "#1f2937", "#7c3aed",
];

const MAX_VIDEO_DURATION = 15;

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
  const [overlayText, setOverlayText] = useState("");
  const [showOverlayInput, setShowOverlayInput] = useState(false);
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
      const video = document.createElement("video");
      video.preload = "metadata";
      const objectUrl = URL.createObjectURL(file);
      
      video.onloadeddata = () => {
        const duration = video.duration;
        
        if (!isFinite(duration) || isNaN(duration)) {
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
            description: `Maximum ${MAX_VIDEO_DURATION} seconds. Your video is ${Math.floor(duration)}s.`,
          });
          if (fileInputRef.current) fileInputRef.current.value = "";
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
        toast({ variant: "destructive", title: "Error", description: "Could not load video." });
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
      toast({ variant: "destructive", title: "Error", description: "Please enter some text" });
      return;
    }

    if ((mode === "image" || mode === "video") && !mediaFile) {
      toast({ variant: "destructive", title: "Error", description: "Please select a media file" });
      return;
    }

    setLoading(true);

    try {
      let mediaUrl = null;

      if (mediaFile) {
        const fileExt = mediaFile.name.split(".").pop();
        const fileName = `statuses/${userId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(fileName, mediaFile);

        if (uploadError) throw uploadError;

        // Store the public URL format - the StatusMediaRenderer will generate
        // a signed URL on-demand since chat-attachments is a private bucket
        const { data: { publicUrl } } = supabase.storage
          .from("chat-attachments")
          .getPublicUrl(fileName);

        mediaUrl = publicUrl;
      }

      const { error } = await supabase.from("statuses").insert({
        user_id: userId,
        content: mode === "text" ? content : (overlayText || null),
        media_url: mediaUrl,
        media_type: mode,
        background_color: mode === "text" ? selectedColor : null,
      });

      if (error) throw error;

      toast({ title: "Status posted!", description: "Visible for 24 hours" });
      onStatusCreated();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setContent("");
    setOverlayText("");
    setShowOverlayInput(false);
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
        className="w-full h-full max-w-none max-h-none p-0 m-0 overflow-hidden bg-black border-0 rounded-none"
        style={{ width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh' }}
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
                <button onClick={handleClose} className="p-2 -ml-2 text-foreground/70">
                  <X className="w-6 h-6" />
                </button>
                <h2 className="text-foreground font-semibold text-lg">Add Status</h2>
                <div className="w-10" />
              </div>

              {/* Options */}
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                <p className="text-muted-foreground text-sm mb-4">Share something</p>
                
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleTextMode}
                  className="w-full max-w-sm flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-primary to-accent text-white shadow-lg"
                >
                  <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
                    <Type className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">Text Status</p>
                    <p className="text-sm opacity-80">Share thoughts</p>
                  </div>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full max-w-sm flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg"
                >
                  <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">Camera</p>
                    <p className="text-sm opacity-80">Take a photo</p>
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
                  className="w-full max-w-sm flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg"
                >
                  <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
                    <Image className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">Photo</p>
                    <p className="text-sm opacity-80">From gallery</p>
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
                  className="w-full max-w-sm flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg"
                >
                  <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
                    <Video className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">Video</p>
                    <p className="text-sm opacity-80">Max {MAX_VIDEO_DURATION}s</p>
                  </div>
                </motion.button>

                <input ref={fileInputRef} type="file" onChange={handleMediaSelect} className="hidden" />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleMediaSelect} className="hidden" />
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
                  className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </motion.button>
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="bg-primary text-primary-foreground rounded-full px-6 h-10 font-semibold shadow-lg"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-4 h-4 mr-2" />Post</>}
                  </Button>
                </motion.div>
              </div>

              {/* Preview Area */}
              <div
                className={cn("flex-1 flex items-center justify-center overflow-hidden relative", mode === "text" && "p-6")}
                style={{ backgroundColor: mode === "text" ? selectedColor : "#000" }}
              >
                {mode === "text" ? (
                  <div className="w-full max-w-lg">
                    <Textarea
                      placeholder="What's on your mind?"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="bg-transparent border-none text-white text-center text-xl font-medium placeholder:text-white/50 resize-none min-h-[200px] focus-visible:ring-0"
                      maxLength={250}
                      autoFocus
                    />
                    <p className="text-white/50 text-center text-sm mt-2">{content.length}/250</p>
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
                  <>
                    <img src={mediaPreview} alt="Preview" className="w-full h-full object-contain" />
                    
                    {/* Text overlay on image */}
                    {overlayText && (
                      <div className="absolute bottom-40 left-4 right-4 z-10">
                        <p className="text-white text-lg font-medium text-center drop-shadow-lg bg-black/40 rounded-xl p-4">
                          {overlayText}
                        </p>
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {/* Text overlay input for images */}
              {mode === "image" && (
                <div className="absolute bottom-24 left-0 right-0 px-4 z-20 safe-area-pb">
                  <AnimatePresence>
                    {showOverlayInput ? (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full p-2"
                      >
                        <Input
                          value={overlayText}
                          onChange={(e) => setOverlayText(e.target.value)}
                          placeholder="Add text to photo..."
                          className="flex-1 bg-transparent border-0 text-white placeholder:text-white/50 focus-visible:ring-0"
                          maxLength={100}
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="rounded-full text-white w-10 h-10"
                          onClick={() => setShowOverlayInput(false)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </motion.div>
                    ) : (
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowOverlayInput(true)}
                        className="mx-auto flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-5 py-3 text-white"
                      >
                        <Type className="w-5 h-5" />
                        <span>Add text</span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              )}

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
                          "w-10 h-10 rounded-full border-2 shadow-lg flex-shrink-0",
                          selectedColor === color ? "border-white scale-110" : "border-white/30"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              )}

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