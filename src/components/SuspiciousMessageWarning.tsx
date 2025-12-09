import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SuspiciousMessageWarningProps {
  children: React.ReactNode;
  flagType: "spam" | "scam" | "abuse" | "suspicious";
  reason?: string;
  enabled?: boolean;
}

const flagLabels = {
  spam: "Spam",
  scam: "Potential Scam",
  abuse: "Abusive Content",
  suspicious: "Suspicious",
};

const SuspiciousMessageWarning = ({
  children,
  flagType,
  reason,
  enabled = true,
}: SuspiciousMessageWarningProps) => {
  const [revealed, setRevealed] = useState(false);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.div
            key="warning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-3 rounded-lg bg-amber-100/80 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700"
          >
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {flagLabels[flagType]} Detected
              </span>
            </div>
            {reason && (
              <p className="text-xs text-amber-600 dark:text-amber-500 mb-2">
                {reason}
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7"
              onClick={() => setRevealed(true)}
            >
              <Eye className="w-3 h-3 mr-1" />
              View Message
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="relative">
              <div className="absolute -top-2 left-2 px-2 py-0.5 bg-amber-500 text-white text-[10px] rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {flagLabels[flagType]}
              </div>
              {children}
              <button
                onClick={() => setRevealed(false)}
                className="absolute top-1 right-1 p-1 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground"
              >
                <EyeOff className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SuspiciousMessageWarning;
