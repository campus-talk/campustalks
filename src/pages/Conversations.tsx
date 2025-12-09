import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Search, Users, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";
import CreateGroupDialog from "@/components/CreateGroupDialog";
import StatusBar from "@/components/StatusBar";

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
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserProfile, setCurrentUserProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    fetchConversations();
    subscribeToMessages();
    loadNotificationCount();
  }, []);

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

  const fetchConversations = async () => {
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
        setLoading(false);
        return;
      }

      // Get conversations with group info
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, is_group, group_id")
        .in("id", conversationIds);

      // Get all participants
      const { data: allParticipants } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", conversationIds);

      // Get other users' profiles
      const otherUserIds = allParticipants
        ?.filter((p) => p.user_id !== userId)
        .map((p) => p.user_id) || [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, status")
        .in("id", otherUserIds);

      // Get groups
      const groupIds = convs?.filter(c => c.is_group && c.group_id).map(c => c.group_id!) || [];
      const { data: groups } = groupIds.length > 0 ? await supabase
        .from("groups")
        .select("id, name, avatar_url")
        .in("id", groupIds) : { data: [] };

      const conversationsData: Conversation[] = [];
      let unreadTotal = 0;

      for (const convId of conversationIds) {
        const conv = convs?.find(c => c.id === convId);
        const { data: messages } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(1);

        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", convId)
          .eq("is_read", false)
          .neq("sender_id", userId);

        const unreadCount = count || 0;
        unreadTotal += unreadCount;

        if (conv?.is_group) {
          const group = groups?.find(g => g.id === conv.group_id);
          if (group) {
            conversationsData.push({
              id: convId,
              is_group: true,
              group,
              lastMessage: messages?.[0] || null,
              unreadCount,
            });
          }
        } else {
          const otherUserId = allParticipants?.find(
            (p) => p.conversation_id === convId && p.user_id !== userId
          )?.user_id;
          const otherUser = profiles?.find((p) => p.id === otherUserId);
          
          if (otherUser) {
            conversationsData.push({
              id: convId,
              is_group: false,
              otherUser,
              lastMessage: messages?.[0] || null,
              unreadCount,
            });
          }
        }
      }

      // Sort by last message time
      conversationsData.sort((a, b) => {
        const timeA = a.lastMessage?.created_at || "";
        const timeB = b.lastMessage?.created_at || "";
        return timeB.localeCompare(timeA);
      });

      setConversations(conversationsData);
      setTotalUnread(unreadTotal);
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

  const subscribeToMessages = () => {
    const channel = supabase
      .channel("conversations-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center geometric-pattern">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen geometric-pattern pb-safe-nav">
      {/* Header */}
      <header className="gradient-primary text-white p-5 shadow-lg premium-shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold">Chats</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full w-10 h-10"
              onClick={() => setCreateGroupOpen(true)}
            >
              <Users className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full w-10 h-10"
              onClick={() => navigate("/search")}
            >
              <Search className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full w-10 h-10 relative"
              onClick={() => navigate("/notifications")}
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 flex items-center justify-center bg-accent text-white text-[10px] font-bold rounded-full px-1">
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </span>
              )}
            </Button>
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
        <div className="border-b border-border/50">
          <StatusBar
            currentUserId={currentUserId}
            currentUserProfile={currentUserProfile}
          />
        </div>
      )}

      {/* Conversations List */}
      <div className="max-w-7xl mx-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-16 h-16 gradient-soft rounded-full flex items-center justify-center mb-4 shadow-lg">
              <Search className="w-8 h-8 text-white" />
            </div>
            <p className="text-muted-foreground text-center mb-4">
              No conversations yet. Start by searching for people!
            </p>
            <Button
              onClick={() => navigate("/search")}
              className="gradient-soft hover:opacity-90 shadow-lg shadow-primary/20"
            >
              <Search className="w-5 h-5 mr-2" />
              Search People
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {conversations.map((conv, index) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => navigate(`/chat/${conv.id}`)}
                className="flex items-center gap-4 p-4 hover:bg-muted/50 cursor-pointer transition-all active:scale-[0.99]"
              >
                <Avatar className="w-14 h-14 border-2 border-primary/20 shadow-sm">
                  <AvatarImage src={conv.is_group ? conv.group?.avatar_url || "" : conv.otherUser?.avatar_url || ""} />
                  <AvatarFallback className="gradient-soft text-white text-xl font-medium">
                    {conv.is_group ? conv.group?.name.charAt(0) : conv.otherUser?.full_name.charAt(0)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold truncate text-foreground">
                      {conv.is_group ? conv.group?.name : conv.otherUser?.full_name}
                    </h3>
                    {conv.lastMessage && (
                      <span className="text-xs text-muted-foreground">
                        {formatTime(conv.lastMessage.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground truncate">
                      {conv.lastMessage
                        ? conv.lastMessage.message_type === "image"
                          ? "📷 Image"
                          : conv.lastMessage.content
                        : "No messages yet"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="gradient-soft text-white text-xs rounded-full px-2.5 py-1 ml-2 font-medium shadow-sm">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
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

export default Conversations;
