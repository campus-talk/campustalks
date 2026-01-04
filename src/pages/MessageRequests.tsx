import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Check, X, MessageCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";

interface MessageRequest {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: string;
  created_at: string;
  requester?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    username: string | null;
  };
}

const MessageRequests = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [activeTab, setActiveTab] = useState<"received" | "sent">("received");

  useEffect(() => {
    loadRequests();
    subscribeToRequests();
  }, []);

  const loadRequests = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(user.id);

    // Load received requests
    const { data: received } = await supabase
      .from("message_requests")
      .select("*")
      .eq("recipient_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Load sent requests
    const { data: sent } = await supabase
      .from("message_requests")
      .select("*")
      .eq("requester_id", user.id)
      .order("created_at", { ascending: false });

    // Fetch profiles for requesters
    if (received && received.length > 0) {
      const requesterIds = received.map(r => r.requester_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, username")
        .in("id", requesterIds);

      const requestsWithProfiles = received.map(req => ({
        ...req,
        requester: profiles?.find(p => p.id === req.requester_id)
      }));
      setRequests(requestsWithProfiles);
    } else {
      setRequests([]);
    }

    // Fetch profiles for sent request recipients
    if (sent && sent.length > 0) {
      const recipientIds = sent.map(r => r.recipient_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, username")
        .in("id", recipientIds);

      const sentWithProfiles = sent.map(req => ({
        ...req,
        requester: profiles?.find(p => p.id === req.recipient_id) // reusing requester field for display
      }));
      setSentRequests(sentWithProfiles);
    } else {
      setSentRequests([]);
    }

    setLoading(false);
  };

  const subscribeToRequests = () => {
    const channel = supabase
      .channel("message-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_requests" },
        () => loadRequests()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  };

  const handleAccept = async (request: MessageRequest) => {
    try {
      // Update request status
      await supabase
        .from("message_requests")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("id", request.id);

      // Create conversation (avoid returning rows; add participants first to satisfy RLS)
      const conversationId = crypto.randomUUID();
      const { error: convErr } = await supabase
        .from("conversations")
        .insert({ id: conversationId });

      if (convErr) throw convErr;

      // Add participants in correct order (self first)
      const { error: meParticipantErr } = await supabase
        .from("conversation_participants")
        .insert({ conversation_id: conversationId, user_id: currentUserId });

      if (meParticipantErr) throw meParticipantErr;

      const { error: requesterParticipantErr } = await supabase
        .from("conversation_participants")
        .insert({ conversation_id: conversationId, user_id: request.requester_id });

      if (requesterParticipantErr) throw requesterParticipantErr;

      toast({
        title: "Request accepted",
        description: `You can now chat with ${request.requester?.full_name}`,
      });

      navigate(`/chat/${conversationId}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleReject = async (request: MessageRequest) => {
    try {
      await supabase
        .from("message_requests")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", request.id);

      toast({
        title: "Request rejected",
        description: "The message request has been declined",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleCancelRequest = async (request: MessageRequest) => {
    try {
      await supabase
        .from("message_requests")
        .delete()
        .eq("id", request.id);

      toast({
        title: "Request cancelled",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-safe-nav">
      {/* Header */}
      <header className="bg-primary text-primary-foreground sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-white/15 rounded-full"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold">Message Requests</h1>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("received")}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            activeTab === "received"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground"
          }`}
        >
          Received ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab("sent")}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            activeTab === "sent"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground"
          }`}
        >
          Sent ({sentRequests.filter(r => r.status === "pending").length})
        </button>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === "received" ? (
            <motion.div
              key="received"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {requests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6">
                  <MessageCircle className="w-16 h-16 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground text-center">
                    No pending message requests
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {requests.map((request) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 px-4 py-4"
                    >
                      <Avatar
                        className="w-12 h-12 cursor-pointer"
                        onClick={() => navigate(`/profile/${request.requester_id}`)}
                      >
                        <AvatarImage src={request.requester?.avatar_url || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {request.requester?.full_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {request.requester?.full_name || "Unknown User"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          @{request.requester?.username || "user"} • {formatTime(request.created_at)}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-9 p-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => handleReject(request)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-9 w-9 p-0 bg-primary hover:bg-primary/90"
                          onClick={() => handleAccept(request)}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="sent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {sentRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6">
                  <Clock className="w-16 h-16 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground text-center">
                    No sent requests
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {sentRequests.map((request) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 px-4 py-4"
                    >
                      <Avatar
                        className="w-12 h-12 cursor-pointer"
                        onClick={() => navigate(`/profile/${request.recipient_id}`)}
                      >
                        <AvatarImage src={request.requester?.avatar_url || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {request.requester?.full_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {request.requester?.full_name || "Unknown User"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {formatTime(request.created_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {request.status === "pending" ? (
                          <>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                              Pending
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-destructive hover:text-destructive"
                              onClick={() => handleCancelRequest(request)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : request.status === "accepted" ? (
                          <span className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">
                            Accepted
                          </span>
                        ) : (
                          <span className="text-xs text-destructive bg-destructive/10 px-2 py-1 rounded-full">
                            Rejected
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <BottomNav />
    </div>
  );
};

export default MessageRequests;