import { RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface SyncIndicatorProps {
  isOnline: boolean;
  isSyncing: boolean;
}

const SyncIndicator = ({ isOnline, isSyncing }: SyncIndicatorProps) => {
  // Only show when offline - don't show syncing state to avoid bad UX
  if (isOnline) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-1.5 text-xs font-medium bg-destructive/90 text-destructive-foreground"
      >
        <WifiOff className="h-3.5 w-3.5" />
        <span>You're offline</span>
      </motion.div>
    </AnimatePresence>
  );
};

export default SyncIndicator;
