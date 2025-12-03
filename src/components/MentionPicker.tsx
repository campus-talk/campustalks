import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";

interface GroupMember {
  user_id: string;
  profiles: {
    full_name: string;
    avatar_url: string | null;
  };
}

interface MentionPickerProps {
  isOpen: boolean;
  groupId: string;
  searchQuery: string;
  onSelect: (userId: string, fullName: string) => void;
  onClose: () => void;
}

const MentionPicker = ({ isOpen, groupId, searchQuery, onSelect, onClose }: MentionPickerProps) => {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && groupId) {
      fetchGroupMembers();
    }
  }, [isOpen, groupId]);

  const fetchGroupMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("group_members")
        .select(`
          user_id,
          profiles:user_id (
            full_name,
            avatar_url
          )
        `)
        .eq("group_id", groupId);

      if (!error && data) {
        setMembers(data as GroupMember[]);
      }
    } catch (error) {
      console.error("Error fetching group members:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members.filter((member) =>
    member.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="absolute bottom-full left-0 right-0 mb-2 glass-effect rounded-xl shadow-lg border border-border/50 max-h-48 overflow-y-auto z-50"
      >
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">Loading...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">No members found</div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredMembers.map((member) => (
              <button
                key={member.user_id}
                onClick={() => {
                  onSelect(member.user_id, member.profiles?.full_name || "User");
                  onClose();
                }}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-primary/10 transition-colors text-left"
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src={member.profiles?.avatar_url || ""} />
                  <AvatarFallback className="text-xs">
                    {member.profiles?.full_name?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm">{member.profiles?.full_name}</span>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default MentionPicker;