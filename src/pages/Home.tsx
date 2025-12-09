import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Search, MessageCircle, Sparkles, Bell, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";

interface Profile {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  unique_key: string;
}

const Home = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    checkAuthAndProfile();
    loadNotificationCount();
  }, []);

  const checkAuthAndProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      if (!profileData.username) {
        navigate("/profile-setup");
        return;
      }

      setProfile(profileData);
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
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="gradient-primary text-white p-5 shadow-lg premium-shadow-lg"
      >
        <div className="max-w-7xl mx-auto">
          {/* Top Row - Profile & Actions */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar className="w-11 h-11 border-2 border-white/30 shadow-lg">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-white/20 text-white font-semibold">
                  {profile?.full_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold text-lg leading-tight">{profile?.full_name}</h2>
                <p className="text-sm text-white/80">@{profile?.username}</p>
              </div>
            </div>
            
            {/* Header Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Search Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/search")}
                className="text-white hover:bg-white/20 rounded-full w-10 h-10"
              >
                <Search className="w-5 h-5" />
              </Button>
              
              {/* Create Group Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/groups")}
                className="text-white hover:bg-white/20 rounded-full w-10 h-10"
              >
                <Users className="w-5 h-5" />
              </Button>
              
              {/* Notifications Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/notifications")}
                className="text-white hover:bg-white/20 rounded-full w-10 h-10 relative"
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
          
          {/* Unique Key Badge */}
          <div className="flex items-center gap-2 bg-white/15 px-4 py-2 rounded-full w-fit">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">{profile?.unique_key}</span>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-effect rounded-2xl p-6 sm:p-8 mb-6 premium-shadow"
        >
          <div className="text-center">
            <div className="w-18 h-18 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg premium-shadow p-4">
              <MessageCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2 text-foreground">Welcome to Campus Talks</h1>
            <p className="text-muted-foreground mb-6">
              Connect with your campus community instantly
            </p>
            <Button
              onClick={() => navigate("/search")}
              className="gradient-primary hover:opacity-90 text-white font-semibold shadow-lg premium-shadow px-6"
              size="lg"
            >
              <Search className="w-5 h-5 mr-2" />
              Find People to Connect
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-effect rounded-2xl p-6 sm:p-8 premium-shadow"
        >
          <h2 className="text-xl font-semibold mb-4 text-foreground">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              onClick={() => navigate("/conversations")}
              className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 border-primary/20"
            >
              <MessageCircle className="w-6 h-6 text-primary" />
              <span className="text-sm font-medium">My Chats</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/groups")}
              className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 border-primary/20"
            >
              <Users className="w-6 h-6 text-primary" />
              <span className="text-sm font-medium">Groups</span>
            </Button>
          </div>
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Home;
