import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { UserX, UserCheck } from "lucide-react";

interface BlockedUser {
  id: string;
  blocked_id: string;
  profiles: {
    full_name: string;
    avatar_url: string | null;
  };
}

interface BlockedUsersListProps {
  currentUserId: string;
}

const BlockedUsersList = ({ currentUserId }: BlockedUsersListProps) => {
  const { toast } = useToast();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBlockedUsers();
  }, [currentUserId]);

  const fetchBlockedUsers = async () => {
    try {
      const { data: blockedData, error } = await supabase
        .from("blocked_users")
        .select("id, blocked_id")
        .eq("blocker_id", currentUserId);

      if (error) throw error;

      if (blockedData && blockedData.length > 0) {
        // Fetch profiles for blocked users
        const blockedIds = blockedData.map(b => b.blocked_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", blockedIds);

        const combined = blockedData.map(b => ({
          id: b.id,
          blocked_id: b.blocked_id,
          profiles: profiles?.find(p => p.id === b.blocked_id) || { full_name: "Unknown", avatar_url: null }
        }));
        setBlockedUsers(combined as BlockedUser[]);
      }
    } catch (error) {
      console.error("Error fetching blocked users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async (blockedId: string) => {
    try {
      const { error } = await supabase
        .from("blocked_users")
        .delete()
        .eq("blocker_id", currentUserId)
        .eq("blocked_id", blockedId);

      if (error) throw error;

      setBlockedUsers((prev) => prev.filter((u) => u.blocked_id !== blockedId));
      toast({
        title: "Unblocked",
        description: "User has been unblocked",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading blocked users...
      </div>
    );
  }

  if (blockedUsers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <UserCheck className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No blocked users</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {blockedUsers.map((user) => (
        <div
          key={user.id}
          className="flex items-center gap-3 p-3 rounded-xl bg-background/50 hover:bg-background/80 transition-colors"
        >
          <Avatar className="w-10 h-10">
            <AvatarImage src={user.profiles?.avatar_url || ""} />
            <AvatarFallback>
              {user.profiles?.full_name?.charAt(0) || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="font-medium">{user.profiles?.full_name}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleUnblock(user.blocked_id)}
            className="text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            <UserCheck className="w-4 h-4 mr-1" />
            Unblock
          </Button>
        </div>
      ))}
    </div>
  );
};

export default BlockedUsersList;