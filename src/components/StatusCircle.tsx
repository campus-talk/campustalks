import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusCircleProps {
  avatarUrl?: string | null;
  name: string;
  hasStatus?: boolean;
  isOwn?: boolean;
  isViewed?: boolean;
  onClick?: () => void;
}

const StatusCircle = ({
  avatarUrl,
  name,
  hasStatus = false,
  isOwn = false,
  isViewed = false,
  onClick,
}: StatusCircleProps) => {
  return (
    <div
      onClick={onClick}
      className="flex flex-col items-center gap-1 cursor-pointer"
    >
      <div className="relative">
        <div
          className={cn(
            "p-0.5 rounded-full",
            hasStatus && !isViewed && "bg-gradient-to-tr from-primary to-accent",
            hasStatus && isViewed && "bg-muted-foreground/30",
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
        {isOwn && (
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-background">
            <Plus className="w-4 h-4 text-primary-foreground" />
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-[64px] text-center">
        {isOwn ? "Your Status" : name.split(" ")[0]}
      </span>
    </div>
  );
};

export default StatusCircle;
