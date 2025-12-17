import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface StatusCircleProps {
  avatarUrl?: string | null;
  name: string;
  hasStatus?: boolean;
  isOwn?: boolean;
  isViewed?: boolean;
  statusCount?: number;
  onClick?: () => void;
  onViewStatus?: () => void;
}

const StatusCircle = ({
  avatarUrl,
  name,
  hasStatus = false,
  isOwn = false,
  isViewed = false,
  statusCount = 0,
  onClick,
  onViewStatus,
}: StatusCircleProps) => {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[72px]">
      <div className="relative">
        {/* Main circle with status ring */}
        <motion.div
          whileTap={{ scale: 0.95 }}
          onClick={onClick}
          className={cn(
            "p-[3px] rounded-full cursor-pointer transition-all",
            hasStatus && !isViewed && "bg-gradient-to-tr from-primary via-accent to-primary",
            hasStatus && isViewed && "bg-muted-foreground/40",
            !hasStatus && isOwn && "bg-border border-2 border-dashed"
          )}
        >
          <Avatar className="w-[64px] h-[64px] border-[3px] border-background">
            <AvatarImage src={avatarUrl || ""} className="object-cover" />
            <AvatarFallback className="bg-muted text-foreground font-semibold text-lg">
              {name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </motion.div>
        
        {/* Add button for own status */}
        {isOwn && (
          <motion.div 
            whileTap={{ scale: 0.9 }}
            onClick={onClick}
            className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-primary flex items-center justify-center border-[3px] border-background cursor-pointer shadow-md"
          >
            <Plus className="w-4 h-4 text-primary-foreground" strokeWidth={3} />
          </motion.div>
        )}

        {/* View button for own statuses when they exist */}
        {isOwn && hasStatus && onViewStatus && (
          <motion.div 
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              onViewStatus();
            }}
            className="absolute -bottom-0.5 -left-0.5 w-7 h-7 rounded-full bg-accent flex items-center justify-center border-[3px] border-background cursor-pointer shadow-md"
          >
            <Eye className="w-3.5 h-3.5 text-accent-foreground" />
          </motion.div>
        )}

        {/* Status count badge */}
        {statusCount > 1 && (
          <div className="absolute -top-1 -right-1 min-w-[22px] h-[22px] rounded-full bg-primary flex items-center justify-center border-[3px] border-background shadow-md">
            <span className="text-[10px] font-bold text-primary-foreground px-1">
              {statusCount}
            </span>
          </div>
        )}
      </div>
      
      <span className={cn(
        "text-[11px] truncate max-w-[72px] text-center leading-tight",
        hasStatus && !isViewed ? "text-foreground font-semibold" : "text-muted-foreground font-medium"
      )}>
        {isOwn ? (hasStatus ? "Your Status" : "Add Status") : name.split(" ")[0]}
      </span>
    </div>
  );
};

export default StatusCircle;
