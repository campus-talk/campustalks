import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Image, Type, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onStatusCreated: () => void;
}

const BACKGROUND_COLORS = [
  "#0ea5a9", // Primary teal
  "#f97316", // Orange
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#10b981", // Green
  "#3b82f6", // Blue
  "#ef4444", // Red
  "#000000", // Black
];

const CreateStatusDialog = ({
  open,
  onOpenChange,
  userId,
  onStatusCreated,
}: CreateStatusDialogProps) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<"text" | "image">("text");
  const [content, setContent] = useState("");
  const [selectedColor, setSelectedColor] = useState(BACKGROUND_COLORS[0]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setMode("image");
    }
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

    if (mode === "image" && !imageFile) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select an image",
      });
      return;
    }

    setLoading(true);

    try {
      let mediaUrl = null;

      if (mode === "image" && imageFile) {
        const fileExt = imageFile.name.split(".").pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(fileName, imageFile);

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
    setImageFile(null);
    setImagePreview(null);
    setMode("text");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Status</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === "text" ? "default" : "outline"}
              onClick={() => setMode("text")}
              className="flex-1"
            >
              <Type className="w-4 h-4 mr-2" />
              Text
            </Button>
            <Button
              variant={mode === "image" ? "default" : "outline"}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1"
            >
              <Image className="w-4 h-4 mr-2" />
              Image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>

          {/* Preview Area */}
          <div
            className={cn(
              "relative rounded-xl overflow-hidden h-64 flex items-center justify-center",
              mode === "text" && "p-4"
            )}
            style={{
              backgroundColor: mode === "text" ? selectedColor : undefined,
            }}
          >
            {mode === "text" ? (
              <Textarea
                placeholder="What's on your mind?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="bg-transparent border-none text-white text-center text-xl font-medium placeholder:text-white/50 resize-none h-full"
                maxLength={250}
              />
            ) : imagePreview ? (
              <>
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                    setMode("text");
                  }}
                  className="absolute top-2 right-2 p-1 bg-background/80 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="text-muted-foreground">Select an image</div>
            )}
          </div>

          {/* Color Picker for Text Mode */}
          {mode === "text" && (
            <div className="flex gap-2 justify-center">
              {BACKGROUND_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-transform",
                    selectedColor === color
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Posting...
              </>
            ) : (
              "Post Status"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateStatusDialog;
