import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, MessageCircle, Video, Phone, UserX, UserCheck, Lock, SendHorizontal, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeKitCall } from "@/hooks/useRealtimeKitCall";
import IncomingCallModalJitsi from "@/components/IncomingCallModalJitsi";
import RtkCallScreen from "@/components/RtkCallScreen";

interface Profile {
  id: string;
  full_name: string;
  username: string;
  unique_key: string;
  avatar_url: string | null;
  bio: string | null;
  status: string;
  is_private: boolean;
}

const Profile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [requestStatus, setRequestStatus] = useState<"none" | "pending" | "accepted" | "rejected">("none");
  const [requestLoading, setRequestLoading] = useState(false);
  
  const {
    startCall,
    startAudioCall,
    acceptCall,
    declineCall,
    endCall,
    isVideoCall,
    incomingCall,
    isInCall,
    callState,
    callConfig,
    currentUserId: rtkUserId,
  } = useRealtimeKitCall(currentUserId);

  useEffect(() => {
    fetchProfile();
    getCurrentUser();
  }, [userId]);

  useEffect(() => {
    if (currentUserId && userId) {
      checkBlockStatus();
      checkRequestStatus();
    }
  }, [currentUserId, userId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

  const checkBlockStatus = async () => {
    const { data } = await supabase
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", currentUserId)
      .eq("blocked_id", userId)
      .single();
    
    setIsBlocked(!!data);
  };

  const checkRequestStatus = async () => {
    // Check if we already sent a request
    const { data: sentRequest } = await supabase
      .from("message_requests")
      .select("status")
      .eq("requester_id", currentUserId)
      .eq("recipient_id", userId)
      .single();

    if (sentRequest) {
      setRequestStatus(sentRequest.status as "pending" | "accepted" | "rejected");
      return;
    }

    // Check if they sent us a request that we accepted
    const { data: receivedRequest } = await supabase
      .from("message_requests")
      .select("status")
      .eq("requester_id", userId)
      .eq("recipient_id", currentUserId)
      .eq("status", "accepted")
      .single();

    if (receivedRequest) {
      setRequestStatus("accepted");
    }
  };

  const handleToggleBlock = async () => {
    if (!userId || !currentUserId) return;
    
    setBlockLoading(true);
    try {
      if (isBlocked) {
        // Unblock
        const { error } = await supabase
          .from("blocked_users")
          .delete()
          .eq("blocker_id", currentUserId)
          .eq("blocked_id", userId);

        if (error) throw error;
        setIsBlocked(false);
        toast({
          title: "Unblocked",
          description: `${profile?.full_name} has been unblocked`,
        });
      } else {
        // Block
        const { error } = await supabase
          .from("blocked_users")
          .insert({
            blocker_id: currentUserId,
            blocked_id: userId,
          });

        if (error) throw error;
        setIsBlocked(true);
        toast({
          title: "Blocked",
          description: `${profile?.full_name} has been blocked`,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setBlockLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      setProfile(data);
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

  const handleStartChat = async () => {
    if (!userId) return;

    try {
      // Ensure we have an authenticated user + reliable current user id
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        navigate("/auth");
        return;
      }
      const me = user.id;
      if (!currentUserId) setCurrentUserId(me);

      // Check if conversation already exists (avoid N+1 where possible)
      const { data: myConvs, error: myConvsErr } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", me);

      if (myConvsErr) throw myConvsErr;

      let conversationId: string | null = null;

      for (const conv of myConvs || []) {
        const { data: participants, error: participantsErr } = await supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", conv.conversation_id);

        if (participantsErr) throw participantsErr;

        const userIds = participants?.map((p) => p.user_id) || [];
        if (userIds.includes(userId) && userIds.includes(me)) {
          conversationId = conv.conversation_id;
          break;
        }
      }

      // Create new conversation if none exists
      if (!conversationId) {
        // IMPORTANT: Don't rely on returning rows here (RLS can block SELECT before participants exist)
        const newConversationId = crypto.randomUUID();

        const { error: convError } = await supabase
          .from("conversations")
          .insert({ id: newConversationId });

        if (convError) throw convError;
        conversationId = newConversationId;

        // Add participants in the correct order (self first, then receiver)
        const { error: meParticipantErr } = await supabase
          .from("conversation_participants")
          .insert({ conversation_id: conversationId, user_id: me });

        if (meParticipantErr) throw meParticipantErr;

        const { error: receiverParticipantErr } = await supabase
          .from("conversation_participants")
          .insert({ conversation_id: conversationId, user_id: userId });

        if (receiverParticipantErr) throw receiverParticipantErr;
      }

      navigate(`/chat/${conversationId}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleSendRequest = async () => {
    if (!userId || !currentUserId) return;
    setRequestLoading(true);

    try {
      const { error } = await supabase.from("message_requests").insert({
        requester_id: currentUserId,
        recipient_id: userId,
      });

      if (error) throw error;

      setRequestStatus("pending");
      toast({
        title: "Request sent",
        description: `Waiting for ${profile?.full_name} to accept your request`,
      });

      // Create notification for recipient
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", currentUserId)
        .single();

      await supabase.from("notifications").insert({
        user_id: userId,
        type: "message_request",
        title: "New message request",
        body: `${senderProfile?.full_name || "Someone"} wants to message you`,
        sender_id: currentUserId,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setRequestLoading(false);
    }
  };

  // Helper to check if user can message (public or accepted request or already has conversation)
  const canMessage = !profile?.is_private || requestStatus === "accepted";

  const handleStartCall = () => {
    if (userId) {
      startCall(userId);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center geometric-pattern">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center geometric-pattern">
        <p>Profile not found</p>
      </div>
    );
  }

  return (
    <>
      {/* Incoming Call Modal */}
      <IncomingCallModalJitsi
        incomingCall={incomingCall}
        onAccept={acceptCall}
        onDecline={declineCall}
      />

      {/* RTK Call Screen */}
      <AnimatePresence>
        {isInCall && (
          <RtkCallScreen
            callConfig={callConfig}
            callState={callState}
            isVideoCall={isVideoCall}
            currentUserId={currentUserId}
            onEndCall={endCall}
          />
        )}
      </AnimatePresence>

      <div className="min-h-screen geometric-pattern">
      {/* Header */}
      <header className="gradient-primary text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold">Profile</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-effect rounded-3xl p-8 text-center"
        >
          {/* Avatar */}
          <Avatar className="w-32 h-32 mx-auto mb-6 border-4 border-primary/20">
            <AvatarImage src={profile.avatar_url || ""} />
            <AvatarFallback className="bg-gradient-primary text-white text-4xl">
              {profile.full_name.charAt(0)}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <h2 className="text-3xl font-bold mb-2">{profile.full_name}</h2>
          <p className="text-muted-foreground mb-1">@{profile.username}</p>
          <p className="text-sm font-mono text-muted-foreground mb-4">
            {profile.unique_key}
          </p>

          {/* Status */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 text-success text-sm mb-6">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
            {profile.status}
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {profile.bio}
            </p>
          )}

          {/* Private Account Badge */}
          {profile.is_private && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium mb-4">
              <Lock className="w-3 h-3" />
              Private Account
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 justify-center">
            {canMessage ? (
              <>
                <Button
                  onClick={handleStartChat}
                  className="gradient-primary hover:gradient-primary-hover text-white font-semibold"
                  size="lg"
                  disabled={isBlocked}
                >
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Message
                </Button>
                <Button
                  onClick={handleStartCall}
                  variant="outline"
                  size="lg"
                  className="border-primary text-primary hover:bg-primary/10"
                  disabled={isBlocked}
                >
                  <Video className="w-5 h-5 mr-2" />
                  Video
                </Button>
                <Button
                  onClick={() => userId && startAudioCall(userId)}
                  variant="outline"
                  size="lg"
                  className="border-primary text-primary hover:bg-primary/10"
                  disabled={isBlocked}
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Audio
                </Button>
              </>
            ) : requestStatus === "pending" ? (
              <Button
                variant="outline"
                size="lg"
                className="border-muted-foreground text-muted-foreground"
                disabled
              >
                <Clock className="w-5 h-5 mr-2" />
                Request Pending
              </Button>
            ) : requestStatus === "rejected" ? (
              <Button
                variant="outline"
                size="lg"
                className="border-destructive/50 text-destructive"
                disabled
              >
                Request Declined
              </Button>
            ) : (
              <Button
                onClick={handleSendRequest}
                className="gradient-primary hover:gradient-primary-hover text-white font-semibold"
                size="lg"
                disabled={requestLoading || isBlocked}
              >
                <SendHorizontal className="w-5 h-5 mr-2" />
                {requestLoading ? "Sending..." : "Send Message Request"}
              </Button>
            )}
          </div>

          {/* Block Button */}
          {currentUserId !== userId && (
            <Button
              onClick={handleToggleBlock}
              variant="ghost"
              size="sm"
              disabled={blockLoading}
              className={`mt-6 ${isBlocked ? "text-green-600 hover:text-green-700" : "text-destructive hover:text-destructive"}`}
            >
              {isBlocked ? (
                <>
                  <UserCheck className="w-4 h-4 mr-2" />
                  Unblock User
                </>
              ) : (
                <>
                  <UserX className="w-4 h-4 mr-2" />
                  Block User
                </>
              )}
            </Button>
          )}
        </motion.div>
      </div>
    </div>
    </>
  );
};

export default Profile;
