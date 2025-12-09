import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface SmartRepliesProps {
  replies: string[];
  onSelect: (reply: string) => void;
  loading?: boolean;
}

const SmartReplies = ({ replies, onSelect, loading }: SmartRepliesProps) => {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
        <Sparkles className="w-4 h-4 text-primary animate-pulse" />
        <span className="text-xs text-muted-foreground">Generating replies...</span>
      </div>
    );
  }

  if (!replies.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-hide"
    >
      <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
      {replies.map((reply, index) => (
        <motion.button
          key={index}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.1 }}
          onClick={() => onSelect(reply)}
          className="px-3 py-1.5 text-sm rounded-full bg-primary/10 hover:bg-primary/20 text-primary whitespace-nowrap transition-colors"
        >
          {reply}
        </motion.button>
      ))}
    </motion.div>
  );
};

export default SmartReplies;
