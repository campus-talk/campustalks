import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Send, Heart, Edit } from "lucide-react";

interface ToneGuardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalMessage: string;
  reason?: string;
  softenedMessage?: string;
  onSendAnyway: () => void;
  onSendSoftened: () => void;
  onEdit: () => void;
  loading?: boolean;
}

const ToneGuardDialog = ({
  open,
  onOpenChange,
  originalMessage,
  reason,
  softenedMessage,
  onSendAnyway,
  onSendSoftened,
  onEdit,
  loading,
}: ToneGuardDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            Message Tone Warning
          </DialogTitle>
          <DialogDescription>
            This message may sound harsh. Would you like to reconsider?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-sm font-medium text-muted-foreground mb-1">Your message:</p>
            <p className="text-sm">{originalMessage}</p>
          </div>

          {reason && (
            <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
              {reason}
            </p>
          )}

          {softenedMessage && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm font-medium text-primary mb-1">Suggested softer version:</p>
              <p className="text-sm">{softenedMessage}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {softenedMessage && (
              <Button
                onClick={onSendSoftened}
                className="w-full gradient-primary"
                disabled={loading}
              >
                <Heart className="w-4 h-4 mr-2" />
                Send Softer Version
              </Button>
            )}
            
            <Button
              onClick={onEdit}
              variant="outline"
              className="w-full"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Message
            </Button>

            <Button
              onClick={onSendAnyway}
              variant="ghost"
              className="w-full text-muted-foreground"
              disabled={loading}
            >
              <Send className="w-4 h-4 mr-2" />
              Send Anyway
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ToneGuardDialog;
