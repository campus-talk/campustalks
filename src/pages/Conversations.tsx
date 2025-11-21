import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Search, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";

interface Conversation {
  id: string;
  otherUser: {
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
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    fetchConversations();
    subscribeToMessages();
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
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

      // Get all participants for these conversations
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

      // Get last message for each conversation
      const conversationsData: Conversation[] = [];
      let unreadTotal = 0;

      for (const convId of conversationIds) {
        const { data: messages } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(1);

        // Count unread messages
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", convId)
          .eq("is_read", false)
          .neq("sender_id", userId);

        const otherUserId = allParticipants?.find(
          (p) => p.conversation_id === convId && p.user_id !== userId
        )?.user_id;

        const otherUser = profiles?.find((p) => p.id === otherUserId);

        if (otherUser) {
          const unreadCount = count || 0;
          unreadTotal += unreadCount;

          conversationsData.push({
            id: convId,
            otherUser,
            lastMessage: messages?.[0] || null,
            unreadCount,
          });
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center geometric-pattern">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen geometric-pattern pb-20">
      {/* Header */}
      <header className="gradient-primary text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold">Chats</h1>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => navigate("/search")}
            >
              <Search className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={handleSignOut}
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>
            Search people...
          </Button>
        </div>
      </header>

      {/* Conversations List */}
      <div className="max-w-7xl mx-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <p className="text-muted-foreground text-center mb-4">
              No conversations yet. Start by searching for people!
            </p>
            <Button
              onClick={() => navigate("/search")}
              className="gradient-primary hover:gradient-primary-hover"
            >
              <Search className="w-5 h-5 mr-2" />
              Search People
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {conversations.map((conv, index) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => navigate(`/chat/${conv.id}`)}
                className="flex items-center gap-4 p-4 hover:bg-accent/50 cursor-pointer transition-colors"
              >
                <Avatar className="w-14 h-14 border-2 border-primary/20">
                  <AvatarImage src={conv.otherUser.avatar_url || ""} />
                  <AvatarFallback className="bg-gradient-primary text-white text-xl">
                    {conv.otherUser.full_name.charAt(0)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold truncate">
                      {conv.otherUser.full_name}
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
                      <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-1 ml-2">
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
    </div>
  );
};

export default Conversations;
