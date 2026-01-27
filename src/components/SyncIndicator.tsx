import { RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncIndicatorProps {
  isOnline: boolean;
  isSyncing: boolean;
}

const SyncIndicator = ({ isOnline, isSyncing }: SyncIndicatorProps) => {
  // Only show when offline or syncing
  if (isOnline && !isSyncing) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-1.5 text-xs font-medium transition-all duration-300",
        !isOnline
          ? "bg-destructive/90 text-destructive-foreground"
          : "bg-primary/90 text-primary-foreground"
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>Offline - Showing cached data</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Syncing...</span>
        </>
      )}
    </div>
  );
};

export default SyncIndicator;
