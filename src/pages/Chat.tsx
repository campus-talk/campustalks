import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Paperclip, Check, CheckCheck, Video, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Star, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmojiPicker } from "@/components/EmojiPicker";
import { useJitsiCall } from "@/hooks/useJitsiCall";
import IncomingCallModalJitsi from "@/components/IncomingCallModalJitsi";
import JitsiCallScreen from "@/components/JitsiCallScreen";
import MessageContextMenu from "@/components/MessageContextMenu";
import DeleteMessageDialog from "@/components/DeleteMessageDialog";
import MentionPicker from "@/components/MentionPicker";
import ForwardMessageDialog from "@/components/ForwardMessageDialog";
import ScheduleMessageDialog from "@/components/ScheduleMessageDialog";
import EncryptionBanner from "@/components/EncryptionBanner";
import ToneGuardDialog from "@/components/ToneGuardDialog";
import SmartReplies from "@/components/SmartReplies";
import SuspiciousMessageWarning from "@/components/SuspiciousMessageWarning";
import ReminderSuggestion from "@/components/ReminderSuggestion";
import DateSeparator from "@/components/DateSeparator";
import ChatUserProfile from "@/components/ChatUserProfile";
import ActiveCallBanner from "@/components/ActiveCallBanner";
import { useAISettings } from "@/hooks/useAISettings";
import { useAIAssistant } from "@/hooks/useAIAssistant";
import { format, isSameDay } from "date-fns";

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
  reply_to?: string | null;
  deleted_for_everyone?: boolean;
  // Optimistic UI fields
  _isOptimistic?: boolean;
  _isFailed?: boolean;
  _tempId?: string;
}

interface CallLog {
  id: string;
  call_type: string;
  call_status: string;
  duration_seconds: number | null;
  created_at: string;
  caller_id: string;
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
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [activeCall, setActiveCall] = useState<{ id: string; call_type: string; participant_count: number; room_name: string } | null>(null);

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialAutoScrollDoneRef = useRef(false);
  const sendingLockRef = useRef(false); // Ref-based lock to prevent double sends

  // Typing indicator state
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number; isSent: boolean } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ messageId: string; canDeleteForEveryone: boolean } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isGroupChat, setIsGroupChat] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearchQuery, setMentionSearchQuery] = useState("");
  const [starredMessages, setStarredMessages] = useState<string[]>([]);
  const [forwardDialog, setForwardDialog] = useState<{ messageId: string; content: string; type: string } | null>(null);
  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [scheduledMessage, setScheduledMessage] = useState("");
  const [userProfileOpen, setUserProfileOpen] = useState(false);
  
  // AI Features State
  const { settings: aiSettings } = useAISettings();
  const { checkToneGuard, getSoftenedMessage, getSmartReplies, detectReminder, getAutoReply, loading: aiLoading } = useAIAssistant(aiSettings);
  const [toneGuardDialog, setToneGuardDialog] = useState<{ message: string; reason?: string; softenedMessage?: string } | null>(null);
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [reminderSuggestion, setReminderSuggestion] = useState<{ messageId: string; title: string; time?: string | null } | null>(null);
  const [loadingSmartReplies, setLoadingSmartReplies] = useState(false);
  
  const [isUserTyping, setIsUserTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedMessageRef = useRef<string | null>(null);
  const typingBroadcastRef = useRef<NodeJS.Timeout | null>(null);

  const {
    startCall,
    startAudioCall,
    joinCall,
    acceptCall,
    declineCall,
    endCall,
    toggleCamera,
    toggleMic,
    toggleScreenShare,
    switchCamera,
    isCameraOn,
    isMicOn,
    isVideoCall,
    isScreenSharing,
    isFrontCamera,
    incomingCall,
    isInCall,
    callState,
    callConfig,
    formattedDuration,
    initializeJitsi,
  } = useJitsiCall(currentUserId);

  useEffect(() => {
    initialAutoScrollDoneRef.current = false;
    initializeChat();
    const unsubMessages = subscribeToMessages();
    const unsubTyping = subscribeToTyping();
    return () => {
      unsubMessages?.();
      unsubTyping?.();
    };
  }, [conversationId]);

  // Mark messages as read immediately when chat opens
  useEffect(() => {
    if (currentUserId && conversationId) {
      markMessagesAsReadOnOpen();
    }
  }, [currentUserId, conversationId]);

  // Check for active calls in this conversation
  useEffect(() => {
    if (!conversationId || isInCall) return;

    const checkActiveCall = async () => {
      const { data } = await supabase
        .from('active_calls')
        .select('id, call_type, participant_count, room_name')
        .eq('conversation_id', conversationId)
        .eq('is_active', true)
        .single();

      setActiveCall(data);
    };

    checkActiveCall();

    // Subscribe to active call changes
    const channel = supabase
      .channel(`active_calls:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_calls',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => checkActiveCall()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, isInCall]);

  // Initial auto-scroll only (do not force scroll when user is reading older messages)
  useEffect(() => {
    if (messages.length === 0) return;
    if (initialAutoScrollDoneRef.current) return;

    requestAnimationFrame(() => {
      scrollToBottom("auto");
      initialAutoScrollDoneRef.current = true;
    });
  }, [messages.length]);

  // handleMessagesScroll moved below markMessagesAsReadOnOpen

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = messagesScrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Mark all unread messages as read when chat opens (server-side update via RPC)
  const markMessagesAsReadOnOpen = useCallback(async () => {
    if (!currentUserId || !conversationId) return;

    try {
      // Use secure server-side RPC that marks messages read for this conversation
      const { data, error } = await supabase.rpc("mark_conversation_read", {
        conversation_uuid: conversationId,
      });

      if (error) {
        console.warn("mark_conversation_read failed", error);
        return;
      }

      // data is number of rows updated; if >0, reflect in UI immediately
      if ((data ?? 0) > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.sender_id !== currentUserId ? { ...m, is_read: true } : m
          )
        );
      }
    } catch (err) {
      console.warn("mark_conversation_read error", err);
    }
  }, [currentUserId, conversationId]);

  // Also mark as read when user scrolls to bottom
  const handleMessagesScrollWithRead = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const wasAtBottom = isAtBottomRef.current;
    isAtBottomRef.current = distanceFromBottom < 80;
    
    // If user scrolled to bottom and wasn't there before, mark as read
    if (isAtBottomRef.current && !wasAtBottom) {
      markMessagesAsReadOnOpen();
    }
  };

  const initializeChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(user.id);

    // Check if this is a group conversation
    const { data: conversationData } = await supabase
      .from("conversations")
      .select("is_group, group_id")
      .eq("id", conversationId)
      .single();

    if (conversationData?.is_group && conversationData.group_id) {
      setIsGroupChat(true);
      setGroupId(conversationData.group_id);
      
      // Get group info
      const { data: groupData } = await supabase
        .from("groups")
        .select("name, avatar_url")
        .eq("id", conversationData.group_id)
        .single();

      if (groupData) {
        setOtherUser({
          id: conversationData.group_id,
          full_name: groupData.name,
          avatar_url: groupData.avatar_url,
        });
      }
    } else {
      // Get conversation participants for 1-on-1 chat
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
    }

    // Load messages, call logs, and starred messages
    loadMessages();
    loadCallLogs();
    loadStarredMessages();
  };

  const loadStarredMessages = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data } = await supabase
      .from("starred_messages")
      .select("message_id")
      .eq("user_id", user.id);
    
    if (data) {
      setStarredMessages(data.map(s => s.message_id));
    }
  };

  const loadCallLogs = async () => {
    const { data } = await supabase
      .from("call_logs")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (data) {
      setCallLogs(data);
    }
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

  // Generate smart replies for incoming messages
  const generateSmartRepliesForMessage = async (message: Message) => {
    if (!aiSettings?.smart_replies_enabled) return;
    if (message.sender_id === currentUserId) return;
    if (message.message_type !== 'text') return;
    if (lastProcessedMessageRef.current === message.id) return;
    
    lastProcessedMessageRef.current = message.id;
    setLoadingSmartReplies(true);
    
    try {
      const replies = await getSmartReplies(message.content);
      if (replies && replies.length > 0) {
        setSmartReplies(replies);
      }
    } catch (error) {
      console.error("Smart replies error:", error);
    } finally {
      setLoadingSmartReplies(false);
    }
  };

  // Auto-reply when user is not typing
  const handleAutoReply = async (message: Message) => {
    if (!aiSettings?.auto_reply_enabled) return;
    if (message.sender_id === currentUserId) return;
    if (message.message_type !== 'text') return;
    if (isUserTyping) return;
    
    try {
      const autoReplyText = await getAutoReply(message.content, messages.slice(-5).map(m => m.content));
      if (autoReplyText && !isUserTyping) {
        // Send auto-reply after a small delay
        setTimeout(async () => {
          if (!isUserTyping) {
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              sender_id: currentUserId,
              content: `🤖 ${autoReplyText}`,
              message_type: "text",
            });
          }
        }, 1500);
      }
    } catch (error) {
      console.error("Auto reply error:", error);
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
        async (payload) => {
          const incoming = { ...(payload.new as Message), reactions: [] };

          // SKIP messages from current user - we handle them optimistically
          // This prevents duplicate messages in the UI
          if (incoming.sender_id === currentUserId) {
            return;
          }

          const shouldAutoScroll = isAtBottomRef.current;

          setMessages((prev) => {
            // Double-check to prevent duplicates
            if (prev.some(m => m.id === incoming.id)) {
              return prev;
            }
            return [...prev, incoming];
          });

          if (shouldAutoScroll) {
            requestAnimationFrame(() => scrollToBottom("smooth"));
          }

          // Generate smart replies for incoming messages
          generateSmartRepliesForMessage(incoming);
          handleAutoReply(incoming);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
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

  // Generate a temporary ID for optimistic messages
  const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleSendMessage = async (e: React.FormEvent, forceMessage?: string) => {
    e.preventDefault();
    const messageToSend = forceMessage || newMessage.trim();
    if (!messageToSend || sendingLockRef.current) return;

    // Lock immediately to prevent double sends
    sendingLockRef.current = true;
      checkToneGuard(messageToSend).then(async (toneResult) => {
        if (toneResult?.shouldWarn) {
          const softened = await getSoftenedMessage(messageToSend);
          setToneGuardDialog({
            message: messageToSend,
            reason: toneResult.reason,
            softenedMessage: softened || undefined,
          });
        }
      }).catch(() => {});
      // Continue sending - we don't block on tone guard
    }

    // Generate temp ID for optimistic message
    const tempId = generateTempId();
    const optimisticMessage: Message = {
      id: tempId,
      content: messageToSend,
      message_type: "text",
      sender_id: currentUserId,
      is_read: false,
      created_at: new Date().toISOString(),
      reactions: [],
      reply_to: replyingTo?.id || null,
      _isOptimistic: true,
      _tempId: tempId,
    };

    // ⚡ INSTANTLY add to UI (optimistic update) - NO BLOCKING
    setMessages(prev => [...prev, optimisticMessage]);
    
    // Clear input immediately for snappy UX
    const savedMessage = messageToSend;
    const savedReplyTo = replyingTo;
    setNewMessage("");
    setReplyingTo(null);
    setSmartReplies([]); // Clear smart replies on send
    
    // ⚡ Auto-scroll to bottom IMMEDIATELY using RAF
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom("smooth");
      });
    });

    // ⚡ OPTIMISTIC: Check tone guard in background ONLY if not forced
    if (!forceMessage && aiSettings?.emotion_filter_enabled) {
      checkToneGuard(messageToSend).then(async (toneResult) => {
        if (toneResult?.shouldWarn) {
          const softened = await getSoftenedMessage(messageToSend);
          setToneGuardDialog({
            message: messageToSend,
            reason: toneResult.reason,
            softenedMessage: softened || undefined,
          });
        }
      }).catch(() => {});
    }

    // 🔄 ASYNC: Database insert happens in background
    try {
      const { data: messageData, error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: savedMessage,
        message_type: "text",
        reply_to: savedReplyTo?.id || null,
      }).select().single();

      if (error) throw error;

      // ✅ RECONCILE: Replace optimistic message with real one
      setMessages(prev => prev.map(m => 
        m._tempId === tempId 
          ? { ...messageData, reactions: [], _isOptimistic: false, _tempId: undefined, _isFailed: undefined }
          : m
      ));

      // 🔄 Background tasks: notifications (fire and forget)
      (async () => {
        try {
          const { data: senderProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", currentUserId)
            .single();

          if (!isGroupChat && otherUser) {
            await supabase.from("notifications").insert({
              user_id: otherUser.id,
              type: "message",
              title: senderProfile?.full_name || "New message",
              body: savedMessage.substring(0, 100),
              sender_id: currentUserId,
              conversation_id: conversationId,
              message_id: messageData?.id,
            });

            supabase.functions.invoke("send-push-notification", {
              body: {
                type: "message",
                recipientIds: [otherUser.id],
                senderId: currentUserId,
                senderName: senderProfile?.full_name || "Someone",
                content: savedMessage.substring(0, 100),
                conversationId: conversationId,
              },
            }).catch(() => {});
          } else if (isGroupChat && groupId) {
            const { data: members } = await supabase
              .from("group_members")
              .select("user_id")
              .eq("group_id", groupId)
              .neq("user_id", currentUserId);

            if (members && members.length > 0) {
              const notifications = members.map(m => ({
                user_id: m.user_id,
                type: "message",
                title: `${senderProfile?.full_name} in ${otherUser?.full_name}`,
                body: savedMessage.substring(0, 100),
                sender_id: currentUserId,
                conversation_id: conversationId,
                message_id: messageData?.id,
              }));

              await supabase.from("notifications").insert(notifications);

              supabase.functions.invoke("send-push-notification", {
                body: {
                  type: "group_message",
                  recipientIds: members.map(m => m.user_id),
                  senderId: currentUserId,
                  senderName: senderProfile?.full_name || "Someone",
                  content: savedMessage.substring(0, 100),
                  conversationId: conversationId,
                  groupName: otherUser?.full_name,
                },
              }).catch(() => {});
            }
          }
        } catch (e) {
          // Non-critical background error
        }
      })();

    } catch (error: any) {
      // ❌ MARK AS FAILED - allow retry
      setMessages(prev => prev.map(m => 
        m._tempId === tempId 
          ? { ...m, _isFailed: true }
          : m
      ));
      toast({
        variant: "destructive",
        title: "Failed to send",
        description: "Tap message to retry",
      });
    } finally {
      setSending(false);
    }
  };

  // Retry sending a failed message
  const handleRetryMessage = async (tempId: string) => {
    const failedMessage = messages.find(m => m._tempId === tempId && m._isFailed);
    if (!failedMessage) return;

    // Mark as sending again
    setMessages(prev => prev.map(m => 
      m._tempId === tempId ? { ...m, _isFailed: false } : m
    ));

    try {
      const { data: messageData, error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: failedMessage.content,
        message_type: failedMessage.message_type,
        reply_to: failedMessage.reply_to || null,
      }).select().single();

      if (error) throw error;

      // Reconcile with real message
      setMessages(prev => prev.map(m => 
        m._tempId === tempId 
          ? { ...messageData, reactions: [], _isOptimistic: false, _tempId: undefined, _isFailed: undefined }
          : m
      ));
    } catch (error) {
      // Mark as failed again
      setMessages(prev => prev.map(m => 
        m._tempId === tempId ? { ...m, _isFailed: true } : m
      ));
      toast({
        variant: "destructive",
        title: "Failed to send",
        description: "Tap message to retry",
      });
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    // Track typing state for auto-reply
    setIsUserTyping(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      setIsUserTyping(false);
    }, 3000); // Stop typing after 3 seconds of inactivity

    // Clear smart replies when user starts typing
    if (value.length > 0) {
      setSmartReplies([]);
    }

    // Check for @ mention trigger in group chats
    if (isGroupChat && groupId) {
      const lastAtIndex = value.lastIndexOf("@");
      if (lastAtIndex !== -1) {
        const textAfterAt = value.substring(lastAtIndex + 1);
        // Check if we're still typing a mention (no space after @)
        if (!textAfterAt.includes(" ")) {
          setShowMentionPicker(true);
          setMentionSearchQuery(textAfterAt);
        } else {
          setShowMentionPicker(false);
        }
      } else {
        setShowMentionPicker(false);
      }
    }
  };

  const handleMentionSelect = (userId: string, fullName: string) => {
    // Find the last @ and replace everything after it with the selected user's name
    const lastAtIndex = newMessage.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const beforeAt = newMessage.substring(0, lastAtIndex);
      setNewMessage(`${beforeAt}@${fullName} `);
    }
    setShowMentionPicker(false);
  };

  const handleLongPress = (e: React.MouseEvent | React.TouchEvent, message: Message) => {
    e.preventDefault();
    const isSent = message.sender_id === currentUserId;
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setContextMenu({ messageId: message.id, x, y, isSent });
  };

  const handleCopyMessage = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.message_type === "text") {
      navigator.clipboard.writeText(message.content);
      toast({
        title: "Copied",
        description: "Message copied to clipboard",
      });
    }
    setContextMenu(null);
  };

  const handleReplyMessage = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      setReplyingTo(message);
    }
    setContextMenu(null);
  };

  const handleDeleteMessage = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    const isSent = message?.sender_id === currentUserId;
    const canDeleteForEveryone = isSent;
    setDeleteDialog({ messageId, canDeleteForEveryone });
    setContextMenu(null);
  };

  const handleDeleteForMe = async () => {
    if (!deleteDialog) return;
    try {
      await supabase
        .from("messages")
        .delete()
        .eq("id", deleteDialog.messageId);
      
      // Remove from local state immediately
      setMessages(prev => prev.filter(m => m.id !== deleteDialog.messageId));
      
      toast({
        title: "Deleted",
        description: "Message deleted",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
    setDeleteDialog(null);
  };

  const handleDeleteForEveryone = async () => {
    if (!deleteDialog) return;
    try {
      await supabase
        .from("messages")
        .delete()
        .eq("id", deleteDialog.messageId);
      
      // Remove from local state immediately
      setMessages(prev => prev.filter(m => m.id !== deleteDialog.messageId));
      
      toast({
        title: "Deleted",
        description: "Message deleted for everyone",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
    setDeleteDialog(null);
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

  const handleStarMessage = async (messageId: string) => {
    try {
      const isStarred = starredMessages.includes(messageId);
      
      if (isStarred) {
        await supabase
          .from("starred_messages")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId);
        
        setStarredMessages(prev => prev.filter(id => id !== messageId));
        toast({ title: "Unstarred", description: "Message unstarred" });
      } else {
        await supabase
          .from("starred_messages")
          .insert({ message_id: messageId, user_id: currentUserId });
        
        setStarredMessages(prev => [...prev, messageId]);
        toast({ title: "Starred", description: "Message starred" });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
    setContextMenu(null);
  };

  const handleForwardMessage = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      setForwardDialog({
        messageId: message.id,
        content: message.content,
        type: message.message_type,
      });
    }
    setContextMenu(null);
  };

  const handleForwardToConversations = async (conversationIds: string[]) => {
    if (!forwardDialog) return;
    
    try {
      for (const convId of conversationIds) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          sender_id: currentUserId,
          content: forwardDialog.content,
          message_type: forwardDialog.type,
          is_forwarded: true,
        });
      }
      
      toast({
        title: "Forwarded",
        description: `Message forwarded to ${conversationIds.length} chat(s)`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
    setForwardDialog(null);
  };

  const handleScheduleMessage = async (scheduledAt: Date) => {
    try {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: scheduledMessage,
        message_type: "text",
        scheduled_at: scheduledAt.toISOString(),
      });
      
      toast({
        title: "Scheduled",
        description: `Message scheduled for ${scheduledAt.toLocaleString()}`,
      });
      setScheduledMessage("");
      setNewMessage("");
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
      {/* Message Context Menu */}
      <MessageContextMenu
        isOpen={!!contextMenu}
        position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : { x: 0, y: 0 }}
        isSentMessage={contextMenu?.isSent || false}
        isStarred={contextMenu ? starredMessages.includes(contextMenu.messageId) : false}
        onReply={() => contextMenu && handleReplyMessage(contextMenu.messageId)}
        onForward={() => contextMenu && handleForwardMessage(contextMenu.messageId)}
        onCopy={() => contextMenu && handleCopyMessage(contextMenu.messageId)}
        onDelete={() => contextMenu && handleDeleteMessage(contextMenu.messageId)}
        onStar={() => contextMenu && handleStarMessage(contextMenu.messageId)}
        onClose={() => setContextMenu(null)}
      />

      {/* Forward Message Dialog */}
      <ForwardMessageDialog
        isOpen={!!forwardDialog}
        messageContent={forwardDialog?.content || ""}
        messageType={forwardDialog?.type || "text"}
        onClose={() => setForwardDialog(null)}
        onForward={handleForwardToConversations}
      />

      {/* Tone Guard Dialog */}
      <ToneGuardDialog
        open={!!toneGuardDialog}
        onOpenChange={() => setToneGuardDialog(null)}
        originalMessage={toneGuardDialog?.message || ""}
        reason={toneGuardDialog?.reason}
        softenedMessage={toneGuardDialog?.softenedMessage}
        onSendAnyway={() => {
          if (toneGuardDialog) {
            handleSendMessage({ preventDefault: () => {} } as React.FormEvent, toneGuardDialog.message);
            setToneGuardDialog(null);
          }
        }}
        onSendSoftened={() => {
          if (toneGuardDialog?.softenedMessage) {
            handleSendMessage({ preventDefault: () => {} } as React.FormEvent, toneGuardDialog.softenedMessage);
            setToneGuardDialog(null);
          }
        }}
        onEdit={() => {
          if (toneGuardDialog) {
            setNewMessage(toneGuardDialog.message);
            setToneGuardDialog(null);
          }
        }}
        loading={aiLoading}
      />

      {/* Schedule Message Dialog */}
      <ScheduleMessageDialog
        isOpen={scheduleDialog}
        message={scheduledMessage}
        onClose={() => setScheduleDialog(false)}
        onSchedule={handleScheduleMessage}
      />

      {/* Delete Message Dialog */}
      <DeleteMessageDialog
        isOpen={!!deleteDialog}
        onClose={() => setDeleteDialog(null)}
        onDeleteForMe={handleDeleteForMe}
        onDeleteForEveryone={handleDeleteForEveryone}
        canDeleteForEveryone={deleteDialog?.canDeleteForEveryone || false}
      />

      {/* Incoming Call Modal */}
      <IncomingCallModalJitsi
        incomingCall={incomingCall}
        onAccept={acceptCall}
        onDecline={declineCall}
      />

      {/* Jitsi Call Screen */}
      <AnimatePresence>
        {isInCall && (
          <JitsiCallScreen
            callConfig={callConfig}
            callState={callState}
            onEndCall={endCall}
            onToggleCamera={toggleCamera}
            onToggleMic={toggleMic}
            onToggleScreenShare={toggleScreenShare}
            isCameraOn={isCameraOn}
            isMicOn={isMicOn}
            isVideoCall={isVideoCall}
            isScreenSharing={isScreenSharing}
            formattedDuration={formattedDuration}
            onInitialize={initializeJitsi}
          />
        )}
      </AnimatePresence>

      <div className="h-screen flex flex-col geometric-pattern">
        {/* Chat User Profile Dialog */}
        <ChatUserProfile
          open={userProfileOpen}
          onOpenChange={setUserProfileOpen}
          userId={otherUser?.id || ""}
          currentUserId={currentUserId}
          isGroup={isGroupChat}
          conversationId={conversationId}
          onStartCall={(video) => {
            setUserProfileOpen(false);
            if (otherUser) {
              video ? startCall(otherUser.id, true, conversationId, isGroupChat) : startAudioCall(otherUser.id, conversationId, isGroupChat);
            }
          }}
        />

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
            <button
              onClick={() => setUserProfileOpen(true)}
              className="flex items-center gap-3 flex-1 text-left hover:bg-white/10 rounded-lg p-1 -m-1 transition-colors"
            >
              <Avatar className="w-10 h-10 border-2 border-white/30">
                <AvatarImage src={otherUser?.avatar_url || ""} alt={otherUser?.full_name} />
                <AvatarFallback className="bg-white/20 text-white">
                  {otherUser?.full_name?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="font-semibold">{otherUser?.full_name}</h2>
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => otherUser && startCall(otherUser.id, true, conversationId, isGroupChat)}
            >
              <Video className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => otherUser && startAudioCall(otherUser.id, conversationId, isGroupChat)}
            >
              <Phone className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Active Call Banner - WhatsApp style */}
        <AnimatePresence>
          {activeCall && !isInCall && (
            <ActiveCallBanner
              callType={activeCall.call_type === 'video' ? 'video' : 'audio'}
              participantCount={activeCall.participant_count}
              onJoin={() => {
                if (conversationId) {
                  joinCall(
                    activeCall.room_name,
                    activeCall.call_type === 'video',
                    conversationId,
                    activeCall.id
                  );
                }
              }}
            />
          )}
        </AnimatePresence>

        {/* Messages */}
        <div
          ref={messagesScrollRef}
          onScroll={handleMessagesScrollWithRead}
          className="flex-1 overflow-y-auto p-4 space-y-4 pb-2"
        >
          {replyingTo && (
            <div className="sticky top-0 z-10 glass-effect border-l-4 border-primary p-3 rounded-lg mb-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Replying to</p>
                  <p className="text-sm text-foreground truncate">{replyingTo.content}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyingTo(null)}
                  className="h-8 w-8 p-0"
                >
                  ✕
                </Button>
              </div>
            </div>
          )}

          {/* Encryption Banner - WhatsApp style inline */}
          <EncryptionBanner
            isGroup={isGroupChat}
            groupName={isGroupChat ? otherUser?.full_name : undefined}
            userName={!isGroupChat ? otherUser?.full_name : undefined}
          />
          
          {/* Merge messages and call logs by timestamp */}
          {(() => {
            // Combine messages and call logs into a single sorted array
            const allItems = [
              ...messages.map(m => ({ type: 'message' as const, data: m, timestamp: m.created_at })),
              ...callLogs.map(c => ({ type: 'call' as const, data: c, timestamp: c.created_at }))
            ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            let lastDate: string | null = null;
            
            return allItems.map((item, index) => {
              const itemDate = format(new Date(item.timestamp), 'yyyy-MM-dd');
              const showDateSeparator = lastDate !== itemDate;
              if (showDateSeparator) lastDate = itemDate;
              
              // Render Call Log
              if (item.type === 'call') {
                const call = item.data as CallLog;
                const isCaller = call.caller_id === currentUserId;
                const isMissed = call.call_status === 'missed';
                const isVideo = call.call_type === 'video';
                
                const formatDuration = (seconds: number | null) => {
                  if (!seconds) return '';
                  const mins = Math.floor(seconds / 60);
                  const secs = seconds % 60;
                  return mins > 0 ? `${mins} min ${secs} sec` : `${secs} secs`;
                };

                return (
                  <div key={`call-${call.id}`}>
                    {showDateSeparator && <DateSeparator date={new Date(item.timestamp)} />}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${isCaller ? "justify-end" : "justify-start"} mb-4`}
                    >
                      <div
                        onClick={() => {
                          if (otherUser) {
                            isVideo ? startCall(otherUser.id, true, conversationId, isGroupChat) : startAudioCall(otherUser.id, conversationId, isGroupChat);
                          }
                        }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] ${
                          isCaller
                            ? "bg-primary/10 rounded-br-sm"
                            : "bg-muted rounded-bl-sm"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isMissed ? 'bg-destructive/20' : 'bg-green-500/20'
                        }`}>
                          {isMissed ? (
                            <PhoneMissed className={`w-5 h-5 ${isMissed ? 'text-destructive' : 'text-green-500'}`} />
                          ) : isCaller ? (
                            <PhoneOutgoing className="w-5 h-5 text-green-500" />
                          ) : (
                            <PhoneIncoming className="w-5 h-5 text-green-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {isMissed 
                              ? `Missed ${isVideo ? 'video' : 'voice'} call` 
                              : `${isVideo ? 'Video' : 'Voice'} call`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isMissed ? 'Tap to call back' : formatDuration(call.duration_seconds) || 'Tap to call back'}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(call.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </motion.div>
                  </div>
                );
              }

              // Render Message
              const message = item.data as Message;
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
                <div key={message.id}>
                  {showDateSeparator && <DateSeparator date={new Date(item.timestamp)} />}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isSent ? "justify-end" : "justify-start"} mb-4 group`}
                    onContextMenu={(e) => !message._isFailed && handleLongPress(e, message)}
                    onTouchStart={(e) => {
                      if (message._isFailed) return;
                      const timer = setTimeout(() => handleLongPress(e, message), 500);
                      const handler = () => clearTimeout(timer);
                      e.currentTarget.addEventListener('touchend', handler, { once: true });
                    }}
                    onClick={() => {
                      // Allow retry on failed messages
                      if (message._isFailed && message._tempId) {
                        handleRetryMessage(message._tempId);
                      }
                    }}
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
                              ? message._isFailed 
                                ? "bg-destructive/80 text-white rounded-br-sm"
                                : "chat-bubble-sent text-white rounded-br-sm"
                              : "chat-bubble-received text-foreground rounded-bl-sm"
                          } ${message._isOptimistic && !message._isFailed ? "opacity-80" : ""}`}
                        >
                          {message.deleted_for_everyone ? (
                            <p className="italic text-muted-foreground">This message was deleted</p>
                          ) : isImage ? (
                            <img
                              src={message.content}
                              alt="Shared image"
                              className="rounded-lg max-w-full"
                            />
                          ) : (
                            <p className="break-words">{message.content}</p>
                          )}
                          <div className={`flex items-center gap-1 mt-1 text-xs ${isSent ? "text-white/70" : "text-muted-foreground"}`}>
                            {starredMessages.includes(message.id) && (
                              <Star className="w-3 h-3 fill-current text-yellow-400" />
                            )}
                            <span>
                              {new Date(message.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {isSent && (
                              message._isFailed ? (
                                <span className="text-white font-medium">⚠ Tap to retry</span>
                              ) : message._isOptimistic ? (
                                <Clock className="w-4 h-4 animate-pulse" />
                              ) : message.is_read ? (
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

                        {/* Emoji Picker - Shows on hover (not for failed messages) */}
                        {!message._isFailed && (
                          <div className={`absolute top-0 ${isSent ? "left-0 -translate-x-full -ml-2" : "right-0 translate-x-full mr-2"}`}>
                            <EmojiPicker onEmojiSelect={(emoji) => handleReaction(message.id, emoji)} />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </div>
              );
            });
          })()}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-card/95 backdrop-blur-xl border-t border-border/30 flex-shrink-0 relative pb-safe-bottom">
          {/* Smart Replies */}
          {smartReplies.length > 0 && (
            <SmartReplies
              replies={smartReplies}
              onSelect={(reply) => {
                setNewMessage(reply);
                setSmartReplies([]);
              }}
              loading={loadingSmartReplies}
            />
          )}
          
          {/* Mention Picker */}
          {isGroupChat && groupId && (
            <MentionPicker
              isOpen={showMentionPicker}
              groupId={groupId}
              searchQuery={mentionSearchQuery}
              onSelect={handleMentionSelect}
              onClose={() => setShowMentionPicker(false)}
            />
          )}
          
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 p-3 pb-4">
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
              className="flex-shrink-0 h-11 w-11 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Paperclip className="w-5 h-5" />
            </Button>
            <div className="flex-1 relative">
              <Input
                value={newMessage}
                onChange={handleMessageChange}
                placeholder={isGroupChat ? "Type @ to mention..." : "Type a message..."}
                className="w-full h-12 bg-muted/50 border-0 rounded-full px-5 focus-visible:ring-1 focus-visible:ring-primary/50"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="flex-shrink-0 h-11 w-11 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => {
                if (newMessage.trim()) {
                  setScheduledMessage(newMessage);
                  setScheduleDialog(true);
                }
              }}
              disabled={!newMessage.trim()}
            >
              <Clock className="w-5 h-5" />
            </Button>
            <Button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="flex-shrink-0 h-12 w-12 rounded-full gradient-primary hover:opacity-90 text-white shadow-lg"
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
