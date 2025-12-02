import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Plus, Users as UsersIcon, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";
import CreateGroupDialog from "@/components/CreateGroupDialog";
import GroupSettings from "@/components/GroupSettings";

interface Group {
  id: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  created_at: string;
  memberCount: number;
}

const Groups = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
    return user?.id || "";
  };

  const fetchGroups = async () => {
    try {
      const userId = await getCurrentUser();
      if (!userId) return;

      // Get groups where user is a member
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);

      if (!memberships || memberships.length === 0) {
        setLoading(false);
        return;
      }

      const groupIds = memberships.map(m => m.group_id);

      // Get group details
      const { data: groupsData, error } = await supabase
        .from("groups")
        .select("*")
        .in("id", groupIds)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get member counts for each group
      const groupsWithCounts = await Promise.all(
        (groupsData || []).map(async (group) => {
          const { count } = await supabase
            .from("group_members")
            .select("*", { count: "exact", head: true })
            .eq("group_id", group.id);

          return {
            ...group,
            memberCount: count || 0,
          };
        })
      );

      setGroups(groupsWithCounts);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGroupClick = async (groupId: string) => {
    // Find the conversation for this group
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("group_id", groupId)
      .eq("is_group", true)
      .single();

    if (conversation) {
      navigate(`/chat/${conversation.id}`);
    }
  };

  const handleGroupSettings = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedGroupId(groupId);
  };

  if (selectedGroupId) {
    return (
      <GroupSettings
        groupId={selectedGroupId}
        currentUserId={currentUserId}
        onClose={() => setSelectedGroupId(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center geometric-pattern">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen geometric-pattern pb-24">
      {/* Header */}
      <header className="gradient-primary text-white p-6 shadow-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Groups</h1>
            <p className="text-sm text-white/80 mt-1">{groups.length} groups</p>
          </div>
          <Button
            onClick={() => setCreateGroupOpen(true)}
            size="icon"
            className="rounded-full bg-white/20 hover:bg-white/30 text-white border-none"
          >
            <Plus className="w-6 h-6" />
          </Button>
        </div>
      </header>

      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        currentUserId={currentUserId}
      />

      {/* Groups List */}
      <div className="max-w-7xl mx-auto p-4">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <UsersIcon className="w-16 h-16 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Groups Yet</h3>
            <p className="text-muted-foreground text-center mb-6">
              Create a group to start chatting with multiple people at once
            </p>
            <Button
              onClick={() => setCreateGroupOpen(true)}
              className="gradient-primary hover:gradient-primary-hover"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Group
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {groups.map((group, index) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleGroupClick(group.id)}
                className="glass-effect rounded-2xl p-4 hover:shadow-lg cursor-pointer transition-all duration-200 hover:scale-[1.02]"
              >
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16 border-2 border-primary/20">
                    <AvatarImage src={group.avatar_url || ""} />
                    <AvatarFallback className="bg-gradient-primary text-white text-xl">
                      {group.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{group.name}</h3>
                    {group.description && (
                      <p className="text-sm text-muted-foreground truncate">
                        {group.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <UsersIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {group.memberCount} members
                      </span>
                    </div>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => handleGroupSettings(group.id, e)}
                    className="hover:bg-background/80"
                  >
                    <Settings className="w-5 h-5" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Groups;