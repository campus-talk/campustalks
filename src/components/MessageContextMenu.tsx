import { motion } from "framer-motion";
import { Reply, Forward, Copy, Trash2 } from "lucide-react";

interface MessageContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  isSentMessage: boolean;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const MessageContextMenu = ({
  isOpen,
  position,
  isSentMessage,
  onReply,
  onForward,
  onCopy,
  onDelete,
  onClose,
}: MessageContextMenuProps) => {
  if (!isOpen) return null;

  // Calculate centered position
  const menuWidth = 200;
  const menuHeight = 220;
  const centerX = Math.max(20, Math.min(window.innerWidth - menuWidth - 20, (window.innerWidth - menuWidth) / 2));
  const centerY = Math.max(20, Math.min(window.innerHeight - menuHeight - 20, position.y - menuHeight / 2));

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="fixed z-50 glass-effect rounded-xl shadow-xl border border-border/50 py-2 w-[200px]"
        style={{
          top: `${centerY}px`,
          left: `${centerX}px`,
        }}
      >
        <button
          onClick={onReply}
          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent/10 transition-colors text-foreground"
        >
          <Reply className="w-4 h-4" />
          <span className="text-sm font-medium">Reply</span>
        </button>
        <button
          onClick={onForward}
          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent/10 transition-colors text-foreground"
        >
          <Forward className="w-4 h-4" />
          <span className="text-sm font-medium">Forward</span>
        </button>
        <button
          onClick={onCopy}
          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent/10 transition-colors text-foreground"
        >
          <Copy className="w-4 h-4" />
          <span className="text-sm font-medium">Copy</span>
        </button>
        <div className="h-px bg-border/50 my-1" />
        <button
          onClick={onDelete}
          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-destructive/10 transition-colors text-destructive"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-sm font-medium">Delete</span>
        </button>
      </motion.div>
    </>
  );
};

export default MessageContextMenu;
