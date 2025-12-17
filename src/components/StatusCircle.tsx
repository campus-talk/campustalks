import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface StatusCircleProps {
  avatarUrl?: string | null;
  name: string;
  hasStatus?: boolean;
  isOwn?: boolean;
  isViewed?: boolean;
  onClick?: () => void;
  onAddNew?: () => void;
}

const StatusCircle = ({
  avatarUrl,
  name,
  hasStatus = false,
  isOwn = false,
  isViewed = false,
  onClick,
  onAddNew,
}: StatusCircleProps) => {
  const getGradientStyle = () => {
    if (!hasStatus) return {};
    if (isViewed) {
      return { background: 'hsl(var(--muted-foreground) / 0.4)' };
    }
    return { background: 'linear-gradient(45deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))' };
  };

  return (
    <div className="flex flex-col items-center gap-1 min-w-[68px]">
      <div className="relative">
        <motion.div
          whileTap={{ scale: 0.95 }}
          onClick={onClick}
          className="cursor-pointer"
        >
          <div
            className={cn(
              "p-[2.5px] rounded-full",
              !hasStatus && isOwn && "border-2 border-dashed border-muted-foreground/50"
            )}
            style={hasStatus ? getGradientStyle() : {}}
          >
            <Avatar className="w-[58px] h-[58px] border-[2.5px] border-background">
              <AvatarImage src={avatarUrl || ""} className="object-cover" />
              <AvatarFallback className="bg-muted text-foreground font-semibold text-base">
                {name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </motion.div>
        
        {/* Add button - always show for own status */}
        {isOwn && (
          <motion.div 
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              onAddNew?.();
            }}
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center border-2 border-background shadow-sm cursor-pointer"
          >
            <Plus className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
          </motion.div>
        )}
      </div>
      
      <span className={cn(
        "text-[11px] truncate max-w-[68px] text-center leading-tight",
        hasStatus && !isViewed ? "text-foreground font-medium" : "text-muted-foreground"
      )}>
        {isOwn ? "Your story" : name.split(" ")[0]}
      </span>
    </div>
  );
};

export default StatusCircle;
