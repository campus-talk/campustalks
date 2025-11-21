import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Paperclip, Check, CheckCheck, Video, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmojiPicker } from "@/components/EmojiPicker";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import IncomingCallModal from "@/components/IncomingCallModal";
import VideoCallScreen from "@/components/VideoCallScreen";

interface Reaction {
  id: string;
  emoji: string;
  user_id: string;
}

interface Message {
  id: string;
  content: string;
  message_type: string;
  sender_id: string;
  is_read: boolean;
  created_at: string;
  reactions?: Reaction[];
}

interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

const Chat = () => {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const {
    startCall,
    startAudioCall,
    acceptCall,
    declineCall,
    endCall,
    toggleCamera,
    toggleMic,
    isCameraOn,
    isMicOn,
    isVideoCall,
    localStream,
    remoteStream,
    incomingCall,
    isInCall,
  } = usePeerConnection(currentUserId);

  useEffect(() => {
    initializeChat();
    subscribeToMessages();
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const initializeChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(user.id);

    // Get conversation participants
    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);

    const otherUserId = participants?.find(p => p.user_id !== user.id)?.user_id;

    if (otherUserId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", otherUserId)
        .single();

      setOtherUser(profile);
    }

    // Load messages
    loadMessages();
  };

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      toast({
        variant: "destructive",
        title: "Error loading messages",
        description: error.message,
      });
      return;
    }

    // Load reactions for each message
    if (data) {
      const messagesWithReactions = await Promise.all(
        data.map(async (msg) => {
          const { data: reactions } = await supabase
            .from("message_reactions")
            .select("id, emoji, user_id")
            .eq("message_id", msg.id);
          
          return { ...msg, reactions: reactions || [] };
        })
      );
      setMessages(messagesWithReactions);
    }
  };

  const subscribeToMessages = () => {
    const messagesChannel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, { ...(payload.new as Message), reactions: [] }]);
        }
      )
      .subscribe();

    const reactionsChannel = supabase
      .channel(`reactions:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        () => {
          // Reload messages when reactions change
          loadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(reactionsChannel);
    };
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: newMessage.trim(),
        message_type: "text",
      });

      if (error) throw error;

      setNewMessage("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setSending(false);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      // Check if user already reacted with this emoji
      const message = messages.find(m => m.id === messageId);
      const existingReaction = message?.reactions?.find(
        r => r.user_id === currentUserId && r.emoji === emoji
      );

      if (existingReaction) {
        // Remove reaction
        await supabase
          .from("message_reactions")
          .delete()
          .eq("id", existingReaction.id);
      } else {
        // Add reaction
        await supabase
          .from("message_reactions")
          .insert({
            message_id: messageId,
            user_id: currentUserId,
            emoji,
          });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${conversationId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("chat-attachments")
        .getPublicUrl(fileName);

      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: publicUrl,
        message_type: "image",
      });

      if (messageError) throw messageError;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error uploading image",
        description: error.message,
      });
    }
  };

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
            onToggleCamera={toggleCamera}
            onToggleMic={toggleMic}
            isCameraOn={isCameraOn}
            isMicOn={isMicOn}
            isVideoCall={isVideoCall}
          />
        )}
      </AnimatePresence>

      <div className="h-screen flex flex-col geometric-pattern">
        {/* Header */}
        <header className="gradient-primary text-white p-4 shadow-lg flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => navigate("/conversations")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Avatar className="w-10 h-10 border-2 border-white/30">
              <AvatarImage src={otherUser?.avatar_url || ""} alt={otherUser?.full_name} />
              <AvatarFallback className="bg-white/20 text-white">
                {otherUser?.full_name?.charAt(0) || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="font-semibold">{otherUser?.full_name}</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => otherUser && startCall(otherUser.id)}
            >
              <Video className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => otherUser && startAudioCall(otherUser.id)}
            >
              <Phone className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-2">
        {messages.map((message) => {
          const isSent = message.sender_id === currentUserId;
          const isImage = message.message_type === "image";

          // Group reactions by emoji with count
          const reactionGroups = message.reactions?.reduce((acc, reaction) => {
            if (!acc[reaction.emoji]) {
              acc[reaction.emoji] = {
                count: 0,
                userIds: [],
              };
            }
            acc[reaction.emoji].count++;
            acc[reaction.emoji].userIds.push(reaction.user_id);
            return acc;
          }, {} as Record<string, { count: number; userIds: string[] }>);

          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${isSent ? "justify-end" : "justify-start"} mb-4 group`}
            >
              <div className={`max-w-[70%] ${isSent ? "" : "flex items-start gap-2"}`}>
                {!isSent && (
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={otherUser?.avatar_url || ""} />
                    <AvatarFallback className="bg-gradient-primary text-white text-sm">
                      {otherUser?.full_name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className="relative">
                  <div
                    className={`rounded-2xl px-4 py-3 ${
                      isSent
                        ? "chat-bubble-sent text-white rounded-br-sm"
                        : "chat-bubble-received text-foreground rounded-bl-sm"
                    }`}
                  >
                    {isImage ? (
                      <img
                        src={message.content}
                        alt="Shared image"
                        className="rounded-lg max-w-full"
                      />
                    ) : (
                      <p className="break-words">{message.content}</p>
                    )}
                    <div className={`flex items-center gap-1 mt-1 text-xs ${isSent ? "text-white/70" : "text-muted-foreground"}`}>
                      <span>
                        {new Date(message.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {isSent && (
                        message.is_read ? (
                          <CheckCheck className="w-4 h-4 text-blue-300" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )
                      )}
                    </div>
                  </div>

                  {/* Reactions Display */}
                  {reactionGroups && Object.keys(reactionGroups).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(reactionGroups).map(([emoji, data]) => {
                        const userReacted = data.userIds.includes(currentUserId);
                        return (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(message.id, emoji)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-all ${
                              userReacted
                                ? "bg-primary/20 border border-primary"
                                : "bg-background/80 border border-border hover:bg-primary/10"
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="text-xs">{data.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Emoji Picker - Shows on hover */}
                  <div className={`absolute top-0 ${isSent ? "left-0 -translate-x-full -ml-2" : "right-0 translate-x-full mr-2"}`}>
                    <EmojiPicker onEmojiSelect={(emoji) => handleReaction(message.id, emoji)} />
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="glass-effect border-t border-border p-3 flex-shrink-0">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <input
            type="file"
            id="image-upload"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => document.getElementById("image-upload")?.click()}
            className="flex-shrink-0"
          >
            <Paperclip className="w-5 h-5" />
          </Button>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-background/50"
          />
            <Button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="gradient-primary hover:gradient-primary-hover text-white flex-shrink-0"
              size="icon"
            >
              <Send className="w-5 h-5" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
};

export default Chat;
