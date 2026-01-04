import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Users, Search } from "lucide-react";

interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  username: string | null;
}

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
}

const CreateGroupDialog = ({ open, onOpenChange, currentUserId }: CreateGroupDialogProps) => {
  const { toast } = useToast();
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open]);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, username")
      .neq("id", currentUserId);

    if (!error && data) {
      setAllUsers(data);
    }
  };

  const filteredUsers = allUsers.filter(
    (user) =>
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast({
        title: "Group name required",
        description: "Please enter a group name",
        variant: "destructive",
      });
      return;
    }

    if (selectedUsers.size === 0) {
      toast({
        title: "Select members",
        description: "Please select at least one member",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);

    try {
      // Create group
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .insert({
          name: groupName.trim(),
          description: groupDescription.trim() || null,
          created_by: currentUserId,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as admin
      const members = [
        { group_id: group.id, user_id: currentUserId, role: "admin" },
        ...Array.from(selectedUsers).map((userId) => ({
          group_id: group.id,
          user_id: userId,
          role: "member",
        })),
      ];

      const { error: membersError } = await supabase
        .from("group_members")
        .insert(members);

      if (membersError) throw membersError;

      // Create conversation for the group
      const conversationId = crypto.randomUUID();
      const { error: convError } = await supabase
        .from("conversations")
        .insert({
          id: conversationId,
          group_id: group.id,
          is_group: true,
        });

      if (convError) throw convError;

      // Add all members to conversation_participants (creator first)
      const { error: creatorParticipantErr } = await supabase
        .from("conversation_participants")
        .insert({ conversation_id: conversationId, user_id: currentUserId });

      if (creatorParticipantErr) throw creatorParticipantErr;

      const otherParticipants = Array.from(selectedUsers).map((userId) => ({
        conversation_id: conversationId,
        user_id: userId,
      }));

      if (otherParticipants.length) {
        const { error: participantsError } = await supabase
          .from("conversation_participants")
          .insert(otherParticipants);

        if (participantsError) throw participantsError;
      }

      toast({
        title: "Group created!",
        description: `${groupName} has been created successfully`,
      });

      // Reset and close
      setGroupName("");
      setGroupDescription("");
      setSelectedUsers(new Set());
      setSearchQuery("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating group:", error);
      toast({
        title: "Error",
        description: "Failed to create group. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Create New Group
          </DialogTitle>
          <DialogDescription>
            Create a group to chat with multiple people
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Group Info */}
          <div className="space-y-3">
            <Input
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={50}
            />
            <Textarea
              placeholder="Group Description (optional)"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              maxLength={200}
              rows={2}
            />
          </div>

          {/* Search Members */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Selected Count */}
          {selectedUsers.size > 0 && (
            <p className="text-sm text-muted-foreground">
              {selectedUsers.size} member{selectedUsers.size > 1 ? "s" : ""} selected
            </p>
          )}

          {/* User List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => toggleUser(user.id)}
              >
                <Checkbox
                  checked={selectedUsers.has(user.id)}
                  onCheckedChange={() => toggleUser(user.id)}
                />
                <Avatar className="w-10 h-10">
                  <AvatarImage src={user.avatar_url || ""} />
                  <AvatarFallback>{user.full_name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user.full_name}</p>
                  {user.username && (
                    <p className="text-sm text-muted-foreground truncate">
                      @{user.username}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateGroup}
            className="flex-1"
            disabled={creating || !groupName.trim() || selectedUsers.size === 0}
          >
            {creating ? "Creating..." : "Create Group"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateGroupDialog;
