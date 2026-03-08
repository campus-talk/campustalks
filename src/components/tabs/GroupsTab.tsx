import { useEffect, useState, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Users as UsersIcon, Settings } from "lucide-react";
import GroupSettings from "@/components/GroupSettings";
import { useAppStore } from "@/stores/appStore";
import { supabase } from "@/integrations/supabase/client";
import { useScrollPosition } from "@/hooks/useScrollPosition";

const GroupsTab = memo(() => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);


  
  // Preserve scroll position across tab switches
  useScrollPosition('groups-tab', scrollRef);

  const {
    currentUserId,
    groups,
    groupsLoading,
    fetchGroups,
  } = useAppStore();

  // Fetch data on mount (cache-first)
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleGroupClick = async (groupId: string) => {
    // Find the conversation for this group
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("group_id", groupId)
      .eq("is_group", true)
      .maybeSingle();

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

  // Show skeleton while loading first time
  if (groupsLoading && groups.length === 0) {
    return (
      <div className="min-h-screen geometric-pattern pb-24">
        <header className="gradient-primary text-white p-6 shadow-lg sticky top-0 z-10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <div className="h-7 w-24 bg-white/20 rounded animate-pulse" />
              <div className="h-4 w-16 bg-white/20 rounded animate-pulse mt-2" />
            </div>
            <div className="h-10 w-10 bg-white/20 rounded-full animate-pulse" />
          </div>
        </header>
        <div className="max-w-7xl mx-auto p-4 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-effect rounded-2xl p-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-muted rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-1/3 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
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
      <div ref={scrollRef} className="max-w-7xl mx-auto p-4">
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
    </div>
  );
});

GroupsTab.displayName = 'GroupsTab';

export default GroupsTab;
