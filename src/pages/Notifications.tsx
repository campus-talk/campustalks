import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessageSquare, Phone, PhoneMissed, PhoneIncoming, Users, Eye, AtSign, Check, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  sender_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  is_read: boolean;
  created_at: string;
  sender?: {
    full_name: string;
    avatar_url: string | null;
  };
}

const Notifications = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
    subscribeToNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch sender profiles
      if (data) {
        const senderIds = [...new Set(data.filter(n => n.sender_id).map(n => n.sender_id))];
        
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", senderIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const notificationsWithSenders = data.map(n => ({
          ...n,
          sender: n.sender_id ? profileMap.get(n.sender_id) : undefined,
        }));

        setNotifications(notificationsWithSenders);
      }
    } catch (error: any) {
      console.error("Error loading notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToNotifications = () => {
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id);
    }

    // Navigate based on type
    if (notification.conversation_id) {
      navigate(`/chat/${notification.conversation_id}`);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      toast({
        title: "Done",
        description: "All notifications marked as read",
      });
      loadNotifications();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const clearAllNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id);

      toast({
        title: "Done",
        description: "All notifications cleared",
      });
      setNotifications([]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "message":
        return <MessageSquare className="w-5 h-5 text-primary" />;
      case "call":
        return <Phone className="w-5 h-5 text-green-500" />;
      case "missed_call":
        return <PhoneMissed className="w-5 h-5 text-destructive" />;
      case "incoming_call":
        return <PhoneIncoming className="w-5 h-5 text-accent" />;
      case "group_invite":
        return <Users className="w-5 h-5 text-purple-500" />;
      case "status_view":
        return <Eye className="w-5 h-5 text-blue-500" />;
      case "mention":
        return <AtSign className="w-5 h-5 text-orange-500" />;
      default:
        return <Bell className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen geometric-pattern pb-20">
      <header className="gradient-primary text-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6" />
            <h1 className="text-2xl font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <span className="bg-white/20 text-white text-sm font-medium px-2 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
                onClick={markAllAsRead}
              >
                <Check className="w-4 h-4 mr-1" />
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
                onClick={clearAllNotifications}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bell className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-foreground">No notifications</h3>
            <p className="text-sm text-muted-foreground">
              You're all caught up!
            </p>
          </motion.div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {notifications.map((notification, index) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-4 rounded-xl cursor-pointer transition-all ${
                    notification.is_read
                      ? "bg-card hover:bg-muted"
                      : "bg-primary/5 hover:bg-primary/10 border-l-4 border-primary"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {notification.sender ? (
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={notification.sender.avatar_url || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {notification.sender.full_name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        {getNotificationIcon(notification.type)}
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {notification.sender && (
                          <div className="w-5 h-5 flex items-center justify-center">
                            {getNotificationIcon(notification.type)}
                          </div>
                        )}
                        <p className="font-semibold text-foreground truncate">
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      {notification.body && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.body}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Notifications;