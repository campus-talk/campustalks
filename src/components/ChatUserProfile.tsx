import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { 
  X, UserX, UserCheck, MessageCircle, Video, Phone, 
  Clock, Trash2, ChevronRight, Bell, BellOff 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ChatUserProfileProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentUserId: string;
  isGroup?: boolean;
  conversationId?: string;
  onStartCall?: (video: boolean) => void;
}

interface Profile {
  id: string;
  full_name: string;
  username: string | null;
  unique_key: string;
  avatar_url: string | null;
  bio: string | null;
  status: string;
}

const DISAPPEARING_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const ChatUserProfile = ({
  open,
  onOpenChange,
  userId,
  currentUserId,
  isGroup = false,
  conversationId,
  onStartCall,
}: ChatUserProfileProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [disappearingTime, setDisappearingTime] = useState("off");
  const [isMuted, setIsMuted] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  useEffect(() => {
    if (open && userId) {
      fetchProfile();
      checkBlockStatus();
    }
  }, [open, userId]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      if (isGroup) {
        const { data, error } = await supabase
          .from("groups")
          .select("id, name, description, avatar_url")
          .eq("id", userId)
          .single();

        if (error) throw error;
        setProfile({
          id: data.id,
          full_name: data.name,
          username: null,
          unique_key: "",
          avatar_url: data.avatar_url,
          bio: data.description,
          status: "Group",
        });
      } else {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (error) throw error;
        setProfile(data);
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkBlockStatus = async () => {
    if (isGroup) return;
    
    const { data } = await supabase
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", currentUserId)
      .eq("blocked_id", userId)
      .single();

    setIsBlocked(!!data);
  };

  const handleToggleBlock = async () => {
    if (!userId || !currentUserId || isGroup) return;

    setBlockLoading(true);
    try {
      if (isBlocked) {
        await supabase
          .from("blocked_users")
          .delete()
          .eq("blocker_id", currentUserId)
          .eq("blocked_id", userId);

        setIsBlocked(false);
        toast({
          title: "Unblocked",
          description: `${profile?.full_name} has been unblocked`,
        });
      } else {
        await supabase
          .from("blocked_users")
          .insert({
            blocker_id: currentUserId,
            blocked_id: userId,
          });

        setIsBlocked(true);
        toast({
          title: "Blocked",
          description: `${profile?.full_name} has been blocked`,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setBlockLoading(false);
    }
  };

  const handleDisappearingChange = async (value: string) => {
    setDisappearingTime(value);
    
    // Calculate disappearing time
    let disappearingInterval: string | null = null;
    switch (value) {
      case "1h": disappearingInterval = "1 hour"; break;
      case "24h": disappearingInterval = "24 hours"; break;
      case "7d": disappearingInterval = "7 days"; break;
      case "30d": disappearingInterval = "30 days"; break;
      default: disappearingInterval = null;
    }

    toast({
      title: disappearingInterval ? "Disappearing messages enabled" : "Disappearing messages disabled",
      description: disappearingInterval 
        ? `Messages will disappear after ${disappearingInterval}`
        : "Messages will no longer disappear",
    });
  };

  const handleViewProfile = () => {
    onOpenChange(false);
    navigate(`/profile/${userId}`);
  };

  const handleClearChat = async () => {
    if (!conversationId) return;

    try {
      await supabase
        .from("messages")
        .delete()
        .eq("conversation_id", conversationId);

      toast({
        title: "Chat cleared",
        description: "All messages have been deleted",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  if (loading || !profile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      {/* Full Image Dialog */}
      <Dialog open={showFullImage} onOpenChange={setShowFullImage}>
        <DialogContent className="max-w-lg p-0 bg-black border-0">
          <button
            onClick={() => setShowFullImage(false)}
            className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white"
          >
            <X className="w-5 h-5" />
          </button>
          {profile.avatar_url && (
            <img
              src={profile.avatar_url}
              alt={profile.full_name}
              className="w-full h-auto"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0 max-h-[90vh] overflow-y-auto">
          {/* Header with Avatar */}
          <div className="relative">
            <div className="h-32 gradient-primary" />
            <button
              onClick={() => onOpenChange(false)}
              className="absolute top-4 right-4 p-2 bg-black/30 rounded-full text-white hover:bg-black/50"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2">
              <Avatar
                className="w-32 h-32 border-4 border-background cursor-pointer"
                onClick={() => profile.avatar_url && setShowFullImage(true)}
              >
                <AvatarImage src={profile.avatar_url || ""} />
                <AvatarFallback className="bg-primary text-white text-3xl">
                  {profile.full_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>

          {/* Profile Info */}
          <div className="pt-20 pb-6 px-6 text-center">
            <h2 className="text-2xl font-bold">{profile.full_name}</h2>
            {profile.username && (
              <p className="text-muted-foreground">@{profile.username}</p>
            )}
            {!isGroup && profile.unique_key && (
              <p className="text-sm font-mono text-muted-foreground mt-1">
                {profile.unique_key}
              </p>
            )}
            {profile.status && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-sm mt-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {profile.status}
              </div>
            )}
            {profile.bio && (
              <p className="text-muted-foreground mt-4 text-sm">{profile.bio}</p>
            )}
          </div>

          {/* Quick Actions */}
          {!isGroup && (
            <div className="flex justify-center gap-4 px-6 pb-6">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => onStartCall?.(true)}
                disabled={isBlocked}
              >
                <Video className="w-5 h-5 mr-2" />
                Video
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => onStartCall?.(false)}
                disabled={isBlocked}
              >
                <Phone className="w-5 h-5 mr-2" />
                Audio
              </Button>
            </div>
          )}

          {/* Settings */}
          <div className="border-t px-4 py-2">
            {/* Disappearing Messages */}
            <div className="flex items-center justify-between py-4 border-b">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Disappearing messages</p>
                  <p className="text-sm text-muted-foreground">Auto-delete after set time</p>
                </div>
              </div>
              <Select value={disappearingTime} onValueChange={handleDisappearingChange}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISAPPEARING_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mute Notifications */}
            <button
              onClick={() => {
                setIsMuted(!isMuted);
                toast({
                  title: isMuted ? "Notifications unmuted" : "Notifications muted",
                });
              }}
              className="w-full flex items-center justify-between py-4 border-b hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-500/10">
                  {isMuted ? (
                    <BellOff className="w-5 h-5 text-blue-500" />
                  ) : (
                    <Bell className="w-5 h-5 text-blue-500" />
                  )}
                </div>
                <span className="font-medium">
                  {isMuted ? "Unmute notifications" : "Mute notifications"}
                </span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* View Full Profile */}
            {!isGroup && (
              <button
                onClick={handleViewProfile}
                className="w-full flex items-center justify-between py-4 border-b hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-purple-500/10">
                    <MessageCircle className="w-5 h-5 text-purple-500" />
                  </div>
                  <span className="font-medium">View full profile</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            )}

            {/* Clear Chat */}
            <button
              onClick={handleClearChat}
              className="w-full flex items-center justify-between py-4 border-b hover:bg-muted/50 transition-colors text-orange-500"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-orange-500/10">
                  <Trash2 className="w-5 h-5" />
                </div>
                <span className="font-medium">Clear chat</span>
              </div>
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Block User */}
            {!isGroup && currentUserId !== userId && (
              <button
                onClick={handleToggleBlock}
                disabled={blockLoading}
                className={cn(
                  "w-full flex items-center justify-between py-4 hover:bg-muted/50 transition-colors",
                  isBlocked ? "text-green-600" : "text-destructive"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-full",
                    isBlocked ? "bg-green-500/10" : "bg-destructive/10"
                  )}>
                    {isBlocked ? (
                      <UserCheck className="w-5 h-5" />
                    ) : (
                      <UserX className="w-5 h-5" />
                    )}
                  </div>
                  <span className="font-medium">
                    {isBlocked ? "Unblock user" : "Block user"}
                  </span>
                </div>
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ChatUserProfile;