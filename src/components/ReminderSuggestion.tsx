import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, X, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReminderSuggestionProps {
  messageId: string;
  conversationId: string;
  suggestedTitle: string;
  suggestedTime?: string | null;
  onDismiss: () => void;
}

const ReminderSuggestion = ({
  messageId,
  conversationId,
  suggestedTitle,
  suggestedTime,
  onDismiss,
}: ReminderSuggestionProps) => {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState(suggestedTitle);
  const [dateTime, setDateTime] = useState(
    suggestedTime
      ? new Date(suggestedTime).toISOString().slice(0, 16)
      : new Date(Date.now() + 3600000).toISOString().slice(0, 16) // Default 1 hour from now
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("reminders").insert({
        user_id: user.id,
        conversation_id: conversationId,
        message_id: messageId,
        title,
        reminder_time: new Date(dateTime).toISOString(),
      });

      if (error) throw error;

      toast({
        title: "Reminder Created",
        description: `Reminder set for ${new Date(dateTime).toLocaleString()}`,
      });
      setDialogOpen(false);
      onDismiss();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 mt-1"
      >
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
        >
          <Bell className="w-3 h-3" />
          Create Reminder
        </button>
        <button
          onClick={onDismiss}
          className="p-1 rounded-full hover:bg-muted text-muted-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      </motion.div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Create Reminder
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Reminder title"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Date & Time</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="datetime-local"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="w-full gradient-primary"
            >
              {saving ? "Saving..." : "Save Reminder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReminderSuggestion;
