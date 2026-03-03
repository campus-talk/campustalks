import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { format } from "date-fns";
import { useRealtimeKitCall } from "@/hooks/useRealtimeKitCall";

interface CallLog {
  id: string;
  caller_id: string;
  receiver_id: string;
  call_type: "audio" | "video";
  call_status: "missed" | "answered" | "declined" | "cancelled";
  duration_seconds: number;
  created_at: string;
  caller_profile?: {
    full_name: string;
    avatar_url: string | null;
  };
  receiver_profile?: {
    full_name: string;
    avatar_url: string | null;
  };
}

const Calls = () => {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const { startCall, startAudioCall } = useRealtimeKitCall(currentUserId);

  useEffect(() => {
    fetchCalls();
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
    return user?.id || "";
  };

  const fetchCalls = async () => {
    try {
      const userId = await getCurrentUser();
      if (!userId) return;

      const { data, error } = await supabase
        .from("call_logs")
        .select(`
          *,
          caller_profile:caller_id (full_name, avatar_url),
          receiver_profile:receiver_id (full_name, avatar_url)
        `)
        .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setCalls((data as any) || []);
    } catch (error) {
      console.error("Error fetching calls:", error);
    } finally {
      setLoading(false);
    }
  };

  const getCallIcon = (call: CallLog) => {
    const isMissed = call.call_status === "missed";
    const isIncoming = call.receiver_id === currentUserId;
    
    if (isMissed) {
      return <PhoneMissed className="w-5 h-5 text-destructive" />;
    }
    
    if (isIncoming) {
      return <PhoneIncoming className="w-5 h-5 text-green-500" />;
    }
    
    return <PhoneOutgoing className="w-5 h-5 text-primary" />;
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return "";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCallClick = (call: CallLog) => {
    const otherUserId = call.caller_id === currentUserId ? call.receiver_id : call.caller_id;
    
    if (call.call_type === "video") {
      startCall(otherUserId, true);
    } else {
      startAudioCall(otherUserId);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center geometric-pattern">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen geometric-pattern pb-24">
      {/* Header */}
      <header className="gradient-primary text-white p-6 shadow-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold">Calls</h1>
          <p className="text-sm text-white/80 mt-1">{calls.length} calls</p>
        </div>
      </header>

      {/* Calls List */}
      <div className="max-w-7xl mx-auto p-4">
        {calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Phone className="w-16 h-16 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No calls yet</h3>
            <p className="text-muted-foreground text-center">
              Your call history will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {calls.map((call) => {
              const isIncoming = call.receiver_id === currentUserId;
              const otherProfile = isIncoming ? call.caller_profile : call.receiver_profile;
              
              return (
                <div
                  key={call.id}
                  className="glass-effect rounded-2xl p-4 hover:shadow-lg transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="w-14 h-14 border-2 border-primary/20">
                      <AvatarImage src={otherProfile?.avatar_url || ""} />
                      <AvatarFallback className="bg-gradient-primary text-white">
                        {otherProfile?.full_name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">
                          {otherProfile?.full_name}
                        </h3>
                        {call.call_type === "video" && (
                          <Video className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {getCallIcon(call)}
                        <span>
                          {format(new Date(call.created_at), "MMM d, h:mm a")}
                        </span>
                        {call.duration_seconds > 0 && (
                          <>
                            <Clock className="w-3 h-3" />
                            <span>{formatDuration(call.duration_seconds)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <Button
                      size="icon"
                      onClick={() => handleCallClick(call)}
                      className="rounded-full gradient-primary hover:gradient-primary-hover"
                    >
                      {call.call_type === "video" ? (
                        <Video className="w-5 h-5" />
                      ) : (
                        <Phone className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Calls;