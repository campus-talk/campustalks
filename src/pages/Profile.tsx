import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, MessageCircle, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import IncomingCallModal from "@/components/IncomingCallModal";
import VideoCallScreen from "@/components/VideoCallScreen";

interface Profile {
  id: string;
  full_name: string;
  username: string;
  unique_key: string;
  avatar_url: string | null;
  bio: string | null;
  status: string;
}

const Profile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  
  const {
    startCall,
    acceptCall,
    declineCall,
    endCall,
    localStream,
    remoteStream,
    incomingCall,
    isInCall,
  } = usePeerConnection(currentUserId);

  useEffect(() => {
    fetchProfile();
    getCurrentUser();
  }, [userId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
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
      // Check if conversation already exists
      const { data: existingConversations, error: fetchError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", currentUserId);

      if (fetchError) throw fetchError;

      // Check if there's a conversation with both users
      let conversationId = null;
      
      for (const conv of existingConversations || []) {
        const { data: participants } = await supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", conv.conversation_id);

        const userIds = participants?.map(p => p.user_id) || [];
        if (userIds.includes(userId) && userIds.includes(currentUserId)) {
          conversationId = conv.conversation_id;
          break;
        }
      }

      // Create new conversation if none exists
      if (!conversationId) {
        const { data: newConv, error: convError } = await supabase
          .from("conversations")
          .insert({})
          .select()
          .single();

        if (convError) throw convError;
        conversationId = newConv.id;

        // Add participants
        const { error: participantsError } = await supabase
          .from("conversation_participants")
          .insert([
            { conversation_id: conversationId, user_id: currentUserId },
            { conversation_id: conversationId, user_id: userId },
          ]);

        if (participantsError) throw participantsError;
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
      <IncomingCallModal
        isOpen={!!incomingCall}
        callerName={incomingCall?.callerName || ""}
        callerAvatar={incomingCall?.callerAvatar || null}
        onAccept={acceptCall}
        onDecline={declineCall}
      />

      {/* Video Call Screen */}
      <AnimatePresence>
        {isInCall && (
          <VideoCallScreen
            localStream={localStream}
            remoteStream={remoteStream}
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

          {/* Action Buttons */}
          <div className="flex gap-4 justify-center">
            <Button
              onClick={handleStartChat}
              className="gradient-primary hover:gradient-primary-hover text-white font-semibold flex-1 max-w-xs"
              size="lg"
            >
              <MessageCircle className="w-5 h-5 mr-2" />
              Message
            </Button>
            <Button
              onClick={handleStartCall}
              variant="outline"
              size="lg"
              className="border-primary text-primary hover:bg-primary/10"
            >
              <Video className="w-5 h-5 mr-2" />
              Call
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
    </>
  );
};

export default Profile;
