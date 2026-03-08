import { useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { MessageSquare, Users, Phone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/appStore";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import SyncIndicator from "@/components/SyncIndicator";

// ZegoCloud SDK is lazy-loaded when a call is initiated

// Tab routes that use the persistent shell
const TAB_ROUTES = ["/conversations", "/calls", "/settings"];

const AppShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { isOnline, isSyncing, setSyncing } = useNetworkStatus();
  
  const {
    currentUserId,
    totalUnreadMessages,
    fetchConversations,
    fetchGroups,
    fetchCalls,
    fetchCurrentUserProfile,
    fetchCounts,
    loadFromCache,
    saveToCache,
  } = useAppStore();

  // Load cached data first, then fetch fresh (offline-first)
  useEffect(() => {
    const initializeApp = async () => {
      // Load from localStorage immediately (instant UI)
      loadFromCache();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      
      // Fetch user profile first
      await fetchCurrentUserProfile();
      
      // Only fetch if online
      if (navigator.onLine) {
        setSyncing(true);
        await Promise.all([
          fetchConversations(),
          fetchGroups(),
          fetchCalls(),
          fetchCounts(),
        ]);
        saveToCache();
        setSyncing(false);
      }
    };
    
    initializeApp();
  }, []);

  // Re-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      const resync = async () => {
        setSyncing(true);
        await Promise.all([
          fetchConversations(true),
          fetchGroups(true),
          fetchCalls(true),
          fetchCounts(),
        ]);
        saveToCache();
        setSyncing(false);
      };
      resync();
    }
  }, [isOnline]);

  // Global realtime subscription - lives at shell level, never recreated
  useEffect(() => {
    if (subscriptionRef.current) return; // Already subscribed
    
    const channel = supabase
      .channel("app-shell-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          // Refresh conversations with force to update last messages & unreads
          fetchConversations(true).then(() => saveToCache());
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => fetchCounts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_requests" },
        () => fetchCounts()
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [fetchConversations, fetchCounts, saveToCache]);

  const navItems = useMemo(() => [
    { icon: MessageSquare, label: "Chats", path: "/conversations", badge: totalUnreadMessages },
    { icon: Phone, label: "Calls", path: "/calls", badge: 0 },
    { icon: User, label: "Account", path: "/settings", badge: 0 },
  ], [totalUnreadMessages]);

  const handleTabClick = useCallback((path: string) => {
    // Use replace for tab switches to keep history clean
    navigate(path);
  }, [navigate]);

  const isTabRoute = TAB_ROUTES.includes(location.pathname);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sync indicator - shows offline/syncing state */}
      <SyncIndicator isOnline={isOnline} isSyncing={isSyncing} />
      
      {/* Main content area - renders the current route */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>

      {/* Persistent BottomNav - only shown on tab routes */}
      {isTabRoute && (
        <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-bottom">
          <div className="flex items-stretch justify-around h-16 max-w-lg mx-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <button
                  key={item.path}
                  onClick={() => handleTabClick(item.path)}
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
      )}
    </div>
  );
};

export default AppShell;
