import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Search, Users, Bell, MoreVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";
import CreateGroupDialog from "@/components/CreateGroupDialog";
import StatusBar from "@/components/StatusBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Conversation {
  id: string;
  is_group?: boolean;
  group?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  otherUser?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    status: string;
  };
  lastMessage: {
    content: string;
    created_at: string;
    is_read: boolean;
    sender_id: string;
    message_type: string;
  } | null;
  unreadCount: number;
}

const Conversations = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserProfile, setCurrentUserProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // Memoize total unread
  const totalUnread = useMemo(() => 
    conversations.reduce((sum, c) => sum + c.unreadCount, 0), 
    [conversations]
  );

  // Refetch when returning to this page
  useEffect(() => {
    fetchConversations();
    const unsubscribe = subscribeToMessages();
    loadNotificationCount();
    return unsubscribe;
  }, [location.key]);

  const loadNotificationCount = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setUnreadNotifications(count || 0);
  };

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      
      // Fetch user profile for StatusBar
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .single();
      
      if (profile) {
        setCurrentUserProfile(profile);
      }
    }
    return user?.id || "";
  };

  const fetchConversations = useCallback(async () => {
    try {
      const userId = await getCurrentUser();
      if (!userId) return;

      // Get all conversations for current user
      const { data: participations, error: partError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", userId);

      if (partError) throw partError;

      const conversationIds = participations?.map((p) => p.conversation_id) || [];
      if (conversationIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Batch fetch conversations, participants, and last messages
      const [convsResult, allParticipantsResult] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, is_group, group_id")
          .in("id", conversationIds),
        supabase
          .from("conversation_participants")
          .select("conversation_id, user_id")
          .in("conversation_id", conversationIds),
      ]);

      const convs = convsResult.data || [];
      const allParticipants = allParticipantsResult.data || [];

      // Get other users' profiles
      const otherUserIds = allParticipants
        .filter((p) => p.user_id !== userId)
        .map((p) => p.user_id);

      const uniqueOtherUserIds = [...new Set(otherUserIds)];

      // Get groups
      const groupIds = convs.filter(c => c.is_group && c.group_id).map(c => c.group_id!) || [];

      const [profilesResult, groupsResult] = await Promise.all([
        uniqueOtherUserIds.length > 0 
          ? supabase.from("profiles").select("id, full_name, avatar_url, status").in("id", uniqueOtherUserIds)
          : { data: [] },
        groupIds.length > 0 
          ? supabase.from("groups").select("id, name, avatar_url").in("id", groupIds)
          : { data: [] },
      ]);

      const profiles = profilesResult.data || [];
      const groups = groupsResult.data || [];

      // Fetch last message and unread count for each conversation in parallel
      const conversationPromises = conversationIds.map(async (convId) => {
        const conv = convs.find(c => c.id === convId);
        
        const [messagesResult, unreadResult] = await Promise.all([
          supabase
            .from("messages")
            .select("content, created_at, is_read, sender_id, message_type")
            .eq("conversation_id", convId)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", convId)
            .eq("is_read", false)
            .neq("sender_id", userId),
        ]);

        const lastMessage = messagesResult.data?.[0] || null;
        const unreadCount = unreadResult.count || 0;

        if (conv?.is_group) {
          const group = groups.find(g => g.id === conv.group_id);
          if (group) {
            return {
              id: convId,
              is_group: true,
              group,
              lastMessage,
              unreadCount,
            } as Conversation;
          }
        } else {
          const otherUserId = allParticipants.find(
            (p) => p.conversation_id === convId && p.user_id !== userId
          )?.user_id;
          const otherUser = profiles.find((p) => p.id === otherUserId);
          
          if (otherUser) {
            return {
              id: convId,
              is_group: false,
              otherUser,
              lastMessage,
              unreadCount,
            } as Conversation;
          }
        }
        return null;
      });

      const conversationsData = (await Promise.all(conversationPromises)).filter(Boolean) as Conversation[];

      // Sort by last message time
      conversationsData.sort((a, b) => {
        const timeA = a.lastMessage?.created_at || "";
        const timeB = b.lastMessage?.created_at || "";
        return timeB.localeCompare(timeA);
      });

      setConversations(conversationsData);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const subscribeToMessages = useCallback(() => {
    const channel = supabase
      .channel("conversations-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => fetchConversations()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        () => fetchConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations]);

  // Cleanup expired statuses on load (deferred)
  useEffect(() => {
    const cleanup = () => {
      supabase.from("statuses").delete().lt("expires_at", new Date().toISOString()).then(() => {});
    };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(cleanup, { timeout: 3000 });
    } else {
      setTimeout(cleanup, 2000);
    }
  }, []);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
      <div className="flex-1 overflow-y-auto pb-safe-nav">
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
                          : conv.lastMessage.message_type === "voice"
                          ? "🎤 Voice message"
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

      <BottomNav />
    </div>
  );
};

export default Conversations;