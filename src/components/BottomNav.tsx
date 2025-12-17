import { useState, useEffect } from "react";
import { MessageSquare, Phone, User, Users } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    loadCounts();
    const unsubscribe = subscribeToUpdates();
    return unsubscribe;
  }, []);

  useEffect(() => {
    loadCounts();
  }, [location.pathname]);

  const loadCounts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: conversations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (conversations && conversations.length > 0) {
      const convIds = conversations.map(c => c.conversation_id);
      
      const { count: msgCount } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("conversation_id", convIds)
        .neq("sender_id", user.id)
        .eq("is_read", false);

      setUnreadMessages(msgCount || 0);
    }
  };

  const subscribeToUpdates = () => {
    const msgChannel = supabase
      .channel("nav-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadCounts())
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
    };
  };

  const navItems = [
    { icon: MessageSquare, label: "Chats", path: "/conversations", badge: unreadMessages },
    { icon: Users, label: "Groups", path: "/groups", badge: 0 },
    { icon: Phone, label: "Calls", path: "/calls", badge: 0 },
    { icon: User, label: "Account", path: "/settings", badge: 0 },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/98 backdrop-blur-xl border-t border-border/30 z-50">
      <div className="flex items-stretch justify-around h-20 max-w-lg mx-auto px-1 pb-safe-bottom">
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <motion.button
              key={item.path}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => navigate(item.path)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative active:scale-95 transition-transform py-2"
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "p-3 rounded-2xl transition-all duration-200 relative",
                  isActive ? "bg-primary/15" : "hover:bg-muted"
                )}
              >
                <Icon
                  className={cn(
                    "w-6 h-6 transition-all duration-200",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {item.badge > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 min-w-5 h-5 flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5"
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </motion.span>
                )}
              </motion.div>
              <span
                className={cn(
                  "text-[11px] font-medium transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="activeNavIndicator"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-primary to-accent rounded-b-full"
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;