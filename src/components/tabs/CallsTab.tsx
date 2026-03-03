import { useEffect, useRef, memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock } from "lucide-react";
import { format } from "date-fns";
import { useRealtimeKitCall } from "@/hooks/useRealtimeKitCall";
import { useAppStore } from "@/stores/appStore";
import { useScrollPosition } from "@/hooks/useScrollPosition";

const CallsTab = memo(() => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    currentUserId,
    calls,
    callsLoading,
    fetchCalls,
  } = useAppStore();

  // Preserve scroll position across tab switches
  useScrollPosition('calls-tab', scrollRef);

  const { startCall, startAudioCall } = useRealtimeKitCall(currentUserId);

  // Fetch data on mount (cache-first)
  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const getCallIcon = (call: any) => {
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

  const handleCallClick = (call: any) => {
    const otherUserId = call.caller_id === currentUserId ? call.receiver_id : call.caller_id;
    
    if (call.call_type === "video") {
      startCall(otherUserId, true, call.conversation_id);
    } else {
      startAudioCall(otherUserId, call.conversation_id);
    }
  };

  // Show skeleton while loading first time
  if (callsLoading && calls.length === 0) {
    return (
      <div className="min-h-screen geometric-pattern pb-24">
        <header className="gradient-primary text-white p-6 shadow-lg sticky top-0 z-10">
          <div className="max-w-7xl mx-auto">
            <div className="h-7 w-20 bg-white/20 rounded animate-pulse" />
            <div className="h-4 w-16 bg-white/20 rounded animate-pulse mt-2" />
          </div>
        </header>
        <div className="max-w-7xl mx-auto p-4 space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-effect rounded-2xl p-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-muted rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-1/3 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
                </div>
                <div className="w-10 h-10 bg-muted rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>
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
      <div ref={scrollRef} className="max-w-7xl mx-auto p-4">
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
            {calls.map((call: any) => {
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
    </div>
  );
});

CallsTab.displayName = 'CallsTab';

export default CallsTab;
