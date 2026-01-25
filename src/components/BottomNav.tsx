import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Phone, User, Users } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadMessages, setUnreadMessages] = useState(0);

  const loadCounts = useCallback(async () => {
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
    } else {
      setUnreadMessages(0);
    }
  }, []);

  useEffect(() => {
    loadCounts();
    
    // Subscribe to message updates for real-time badge updates
    const channel = supabase
      .channel("nav-messages-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadCounts)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadCounts]);

  // Reload on route change
  useEffect(() => {
    loadCounts();
  }, [location.pathname, loadCounts]);

  const navItems = [
    { icon: MessageSquare, label: "Chats", path: "/conversations", badge: unreadMessages },
    { icon: Users, label: "Groups", path: "/groups", badge: 0 },
    { icon: Phone, label: "Calls", path: "/calls", badge: 0 },
    { icon: User, label: "Account", path: "/settings", badge: 0 },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-bottom">
      <div className="flex items-stretch justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn("w-6 h-6", isActive && "text-primary")}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>
              <span className={cn("text-[11px]", isActive && "font-medium")}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;