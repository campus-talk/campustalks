import { Lock } from "lucide-react";
import { motion } from "framer-motion";

interface EncryptionBannerProps {
  isGroup?: boolean;
  groupName?: string;
  userName?: string;
}

const EncryptionBanner = ({ isGroup, groupName, userName }: EncryptionBannerProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-center gap-2 py-3 px-4 bg-accent/10 text-accent-foreground/80 text-xs text-center"
    >
      <Lock className="w-3 h-3 flex-shrink-0" />
      <p>
        {isGroup ? (
          <>
            Messages and calls in <span className="font-medium">{groupName}</span> are end-to-end encrypted. 
            No one outside this group, not even Campus Talks, can read or listen to them.
          </>
        ) : (
          <>
            Messages and calls with <span className="font-medium">{userName}</span> are end-to-end encrypted. 
            No one outside this chat, not even Campus Talks, can read or listen to them.
          </>
        )}
      </p>
    </motion.div>
  );
};

export default EncryptionBanner;