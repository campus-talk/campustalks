import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {/* Main circle with status ring */}
        <div
          onClick={onClick}
          className={cn(
            "p-0.5 rounded-full cursor-pointer transition-all",
            hasStatus && !isViewed && "bg-gradient-to-tr from-primary via-accent to-primary",
            hasStatus && isViewed && "bg-muted-foreground/40",
            !hasStatus && "bg-transparent"
          )}
        >
          <Avatar className="w-16 h-16 border-2 border-background">
            <AvatarImage src={avatarUrl || ""} />
            <AvatarFallback className="bg-muted text-foreground font-medium">
              {name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        
        {/* Add button for own status */}
        {isOwn && (
          <div 
            onClick={onClick}
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-background cursor-pointer hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4 text-primary-foreground" />
          </div>
        )}

        {/* View button for own statuses when they exist */}
        {isOwn && hasStatus && onViewStatus && (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onViewStatus();
            }}
            className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-accent flex items-center justify-center border-2 border-background cursor-pointer hover:bg-accent/90 transition-colors"
          >
            <Eye className="w-3 h-3 text-accent-foreground" />
          </div>
        )}

        {/* Status count badge */}
        {statusCount > 1 && (
          <div className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-primary flex items-center justify-center border-2 border-background">
            <span className="text-[10px] font-bold text-primary-foreground px-1">
              {statusCount}
            </span>
          </div>
        )}
      </div>
      
      <span className={cn(
        "text-xs truncate max-w-[64px] text-center",
        hasStatus && !isViewed ? "text-foreground font-medium" : "text-muted-foreground"
      )}>
        {isOwn ? (hasStatus ? "Your Status" : "Add Status") : name.split(" ")[0]}
      </span>
    </div>
  );
};

export default StatusCircle;