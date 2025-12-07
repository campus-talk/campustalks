import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Conversation {
  id: string;
  name: string;
  avatar_url: string | null;
  is_group: boolean;
}

interface ForwardMessageDialogProps {
  isOpen: boolean;
  messageContent: string;
  messageType: string;
  onClose: () => void;
  onForward: (conversationIds: string[]) => void;
}

const ForwardMessageDialog = ({
  isOpen,
  messageContent,
  messageType,
  onClose,
  onForward,
}: ForwardMessageDialogProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversations, setSelectedConversations] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all conversations the user is part of
      const { data: participantData } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (!participantData) return;

      const conversationIds = participantData.map(p => p.conversation_id);

      // Get conversation details
      const { data: conversationsData } = await supabase
        .from("conversations")
        .select("id, is_group, group_id")
        .in("id", conversationIds);

      if (!conversationsData) return;

      const conversationList: Conversation[] = [];

      for (const conv of conversationsData) {
        if (conv.is_group && conv.group_id) {
          const { data: groupData } = await supabase
            .from("groups")
            .select("name, avatar_url")
            .eq("id", conv.group_id)
            .single();

          if (groupData) {
            conversationList.push({
              id: conv.id,
              name: groupData.name,
              avatar_url: groupData.avatar_url,
              is_group: true,
            });
          }
        } else {
          // Get other participant for 1-on-1 chat
          const { data: participants } = await supabase
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", conv.id)
            .neq("user_id", user.id);

          if (participants && participants[0]) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, avatar_url")
              .eq("id", participants[0].user_id)
              .single();

            if (profile) {
              conversationList.push({
                id: conv.id,
                name: profile.full_name,
                avatar_url: profile.avatar_url,
                is_group: false,
              });
            }
          }
        }
      }

      setConversations(conversationList);
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleConversation = (id: string) => {
    setSelectedConversations(prev =>
      prev.includes(id)
        ? prev.filter(c => c !== id)
        : [...prev, id]
    );
  };

  const handleForward = () => {
    if (selectedConversations.length > 0) {
      onForward(selectedConversations);
      setSelectedConversations([]);
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Forward to</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-accent/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Message Preview */}
          <div className="p-3 bg-muted/30 border-b border-border">
            <div className="text-sm text-muted-foreground mb-1">Message:</div>
            {messageType === "image" ? (
              <img src={messageContent} alt="Forward" className="w-16 h-16 rounded-lg object-cover" />
            ) : (
              <p className="text-sm text-foreground truncate">{messageContent}</p>
            )}
          </div>

          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">Loading...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">No conversations found</div>
            ) : (
              filteredConversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => toggleConversation(conv.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-accent/10 transition-colors"
                >
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={conv.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {conv.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">{conv.name}</p>
                    {conv.is_group && (
                      <p className="text-xs text-muted-foreground">Group</p>
                    )}
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedConversations.includes(conv.id)
                      ? "bg-primary border-primary"
                      : "border-border"
                  }`}>
                    {selectedConversations.includes(conv.id) && (
                      <Check className="w-4 h-4 text-primary-foreground" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleForward}
              disabled={selectedConversations.length === 0}
              className="flex-1"
            >
              Forward ({selectedConversations.length})
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ForwardMessageDialog;
