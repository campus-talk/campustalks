import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  canDeleteForEveryone: boolean;
}

const DeleteMessageDialog = ({
  isOpen,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone,
  canDeleteForEveryone,
}: DeleteMessageDialogProps) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Message?</AlertDialogTitle>
          <AlertDialogDescription>
            Choose who you want to delete this message for.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-col gap-2">
          {canDeleteForEveryone && (
            <AlertDialogAction
              onClick={onDeleteForEveryone}
              className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete for Everyone
            </AlertDialogAction>
          )}
          <AlertDialogAction
            onClick={onDeleteForMe}
            className="w-full"
          >
            Delete for Me
          </AlertDialogAction>
          <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteMessageDialog;
