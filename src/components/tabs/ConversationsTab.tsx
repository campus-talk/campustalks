import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Search, Users, Bell, MoreVertical } from "lucide-react";
import CreateGroupDialog from "@/components/CreateGroupDialog";
import StatusBar from "@/components/StatusBar";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/stores/appStore";

const ConversationsTab = () => {
  const navigate = useNavigate();
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  const {
    currentUserId,
    currentUserProfile,
    conversations,
    conversationsLoading,
    unreadNotifications,
    fetchConversations,
    fetchCounts,
  } = useAppStore();

  // Fetch data on mount (cache-first - won't refetch if fresh)
  useEffect(() => {
    fetchConversations();
    fetchCounts();
  }, [fetchConversations, fetchCounts]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Show skeleton while loading first time
  if (conversationsLoading && conversations.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-20">
        <header className="bg-primary text-primary-foreground sticky top-0 z-40">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="h-6 w-32 bg-primary-foreground/20 rounded animate-pulse" />
            <div className="flex gap-2">
              <div className="h-10 w-10 bg-primary-foreground/20 rounded-full animate-pulse" />
              <div className="h-10 w-10 bg-primary-foreground/20 rounded-full animate-pulse" />
            </div>
          </div>
        </header>
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="w-12 h-12 bg-muted rounded-full animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      {/* WhatsApp-style Header */}
      <header className="bg-primary text-primary-foreground sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-semibold">Campus Talks</h1>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-white/10 h-10 w-10"
              onClick={() => navigate("/search")}
            >
              <Search className="w-5 h-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-primary-foreground hover:bg-white/10 h-10 w-10"
                >
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setCreateGroupOpen(true)}>
                  <Users className="w-4 h-4 mr-2" />
                  New group
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/notifications")}>
                  <Bell className="w-4 h-4 mr-2" />
                  Notifications
                  {unreadNotifications > 0 && (
                    <span className="ml-auto bg-primary text-primary-foreground text-xs rounded-full px-1.5">
                      {unreadNotifications}
                    </span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        currentUserId={currentUserId}
      />

      {/* Status Bar */}
      {currentUserProfile && (
        <div className="border-b border-border/30 bg-card">
          <StatusBar
            currentUserId={currentUserId}
            currentUserProfile={currentUserProfile}
          />
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">No chats yet</h3>
            <p className="text-muted-foreground text-center text-sm mb-4">
              Start a conversation by searching for people
            </p>
            <Button
              onClick={() => navigate("/search")}
              className="bg-primary hover:bg-primary/90"
            >
              <Search className="w-4 h-4 mr-2" />
              Find people
            </Button>
          </div>
        ) : (
          <div>
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => navigate(`/chat/${conv.id}`)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors active:bg-muted border-b border-border/20"
              >
                {/* Avatar */}
                <Avatar className="w-12 h-12 flex-shrink-0">
                  <AvatarImage src={conv.is_group ? conv.group?.avatar_url || "" : conv.otherUser?.avatar_url || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {conv.is_group ? conv.group?.name.charAt(0).toUpperCase() : conv.otherUser?.full_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="font-medium text-foreground truncate text-[15px]">
                      {conv.is_group ? conv.group?.name : conv.otherUser?.full_name}
                    </h3>
                    {conv.lastMessage && (
                      <span className={`text-xs flex-shrink-0 ml-2 ${conv.unreadCount > 0 ? "text-primary font-medium" : "text-muted-foreground"}`}>
                        {formatTime(conv.lastMessage.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={`text-sm truncate pr-2 ${conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {conv.lastMessage
                        ? conv.lastMessage.message_type === "image"
                          ? "📷 Photo"
                          : conv.lastMessage.content
                        : "No messages yet"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="bg-primary text-primary-foreground text-xs rounded-full min-w-5 h-5 flex items-center justify-center px-1.5 font-medium flex-shrink-0">
                        {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationsTab;
