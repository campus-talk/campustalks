import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Camera, UserPlus, UserMinus, Shield, Users, Search, ArrowLeft } from "lucide-react";

// Group members are unlimited, only call participants are limited to 30

interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  profiles: {
    full_name: string;
    avatar_url: string | null;
  };
}

interface GroupSettingsProps {
  groupId: string;
  currentUserId: string;
  onClose: () => void;
}

interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

const GroupSettings = ({ groupId, currentUserId, onClose }: GroupSettingsProps) => {
  const { toast } = useToast();
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [addingMembers, setAddingMembers] = useState(false);

  useEffect(() => {
    fetchGroupDetails();
  }, [groupId]);

  const fetchGroupDetails = async () => {
    try {
      // Fetch group details
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", groupId)
        .single();

      if (groupError) throw groupError;
      setGroup(groupData);

      // Fetch members with profile info
      const { data: membersData, error: membersError } = await supabase
        .from("group_members")
        .select(`
          id,
          user_id,
          role,
          profiles:user_id (
            full_name,
            avatar_url
          )
        `)
        .eq("group_id", groupId);

      if (membersError) throw membersError;
      setMembers(membersData as GroupMember[]);

      // Check if current user is admin
      const currentMember = membersData?.find(m => m.user_id === currentUserId);
      setIsAdmin(currentMember?.role === "admin");

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

  const updateGroupInfo = async (field: string, value: string) => {
    if (!isAdmin) {
      toast({
        variant: "destructive",
        title: "Permission denied",
        description: "Only admins can edit group info",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("groups")
        .update({ [field]: value })
        .eq("id", groupId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Group updated successfully",
      });
      fetchGroupDetails();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const updateMemberRole = async (memberId: string, newRole: string) => {
    if (!isAdmin) {
      toast({
        variant: "destructive",
        title: "Permission denied",
        description: "Only admins can change member roles",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("group_members")
        .update({ role: newRole })
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Member role updated",
      });
      fetchGroupDetails();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const removeMember = async (memberId: string, userId: string) => {
    if (!isAdmin) {
      toast({
        variant: "destructive",
        title: "Permission denied",
        description: "Only admins can remove members",
      });
      return;
    }

    if (userId === currentUserId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You cannot remove yourself",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      // Also remove from conversation_participants
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id")
        .eq("group_id", groupId)
        .single();

      if (conversation) {
        await supabase
          .from("conversation_participants")
          .delete()
          .eq("conversation_id", conversation.id)
          .eq("user_id", userId);
      }

      toast({
        title: "Success",
        description: "Member removed from group",
      });
      fetchGroupDetails();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const fetchAllUsers = async () => {
    const memberIds = members.map(m => m.user_id);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .not("id", "in", `(${memberIds.join(",")})`);

    if (!error && data) {
      setAllUsers(data);
    }
  };

  const handleOpenAddMember = () => {
    fetchAllUsers();
    setAddMemberOpen(true);
  };

  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleAddMembers = async () => {
    if (selectedUsers.size === 0) return;

    setAddingMembers(true);
    try {
      // Add to group_members
      const newMembers = Array.from(selectedUsers).map(userId => ({
        group_id: groupId,
        user_id: userId,
        role: "member",
      }));

      const { error: membersError } = await supabase
        .from("group_members")
        .insert(newMembers);

      if (membersError) throw membersError;

      // Add to conversation_participants
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id")
        .eq("group_id", groupId)
        .single();

      if (conversation) {
        const participants = Array.from(selectedUsers).map(userId => ({
          conversation_id: conversation.id,
          user_id: userId,
        }));

        await supabase
          .from("conversation_participants")
          .insert(participants);
      }

      toast({
        title: "Success",
        description: `Added ${selectedUsers.size} member(s) to the group`,
      });

      setAddMemberOpen(false);
      setSelectedUsers(new Set());
      setSearchQuery("");
      fetchGroupDetails();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setAddingMembers(false);
    }
  };

  const filteredUsers = allUsers.filter(
    user =>
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const updateGroupSettings = async (setting: string, value: string) => {
    if (!isAdmin) {
      toast({
        variant: "destructive",
        title: "Permission denied",
        description: "Only admins can change settings",
      });
      return;
    }

    try {
      const newSettings = { ...group.settings, [setting]: value };
      
      const { error } = await supabase
        .from("groups")
        .update({ settings: newSettings })
        .eq("id", groupId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Settings updated",
      });
      fetchGroupDetails();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen geometric-pattern pb-24">
      {/* Header */}
      <header className="gradient-primary text-white p-6 shadow-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
          >
            ←
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Group Settings</h1>
            <p className="text-sm text-white/80">{group?.name}</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Group Profile */}
        <div className="glass-effect rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <Avatar className="w-24 h-24 border-4 border-primary/20">
                <AvatarImage src={group?.avatar_url || ""} />
                <AvatarFallback className="bg-gradient-primary text-white text-3xl">
                  {group?.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              {isAdmin && (
                <Button
                  size="icon"
                  className="absolute bottom-0 right-0 rounded-full h-8 w-8"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{group?.name}</h2>
              <p className="text-muted-foreground">
                {members.length} members
              </p>
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-4">
              <div>
                <Label>Group Name</Label>
                <Input
                  defaultValue={group?.name}
                  onBlur={(e) => updateGroupInfo("name", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  defaultValue={group?.description || ""}
                  onBlur={(e) => updateGroupInfo("description", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>

        {/* Group Permissions */}
        {isAdmin && (
          <div className="glass-effect rounded-2xl p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Permissions
            </h3>
            <div className="space-y-4">
              <div>
                <Label>Who can send messages</Label>
                <Select
                  defaultValue={group?.settings?.send_messages_permission || "everyone"}
                  onValueChange={(value) => updateGroupSettings("send_messages_permission", value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Everyone</SelectItem>
                    <SelectItem value="admins">Admins Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Who can edit group info</Label>
                <Select
                  defaultValue={group?.settings?.who_can_edit_group_info || "admins"}
                  onValueChange={(value) => updateGroupSettings("who_can_edit_group_info", value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Everyone</SelectItem>
                    <SelectItem value="admins">Admins Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Members List */}
        <div className="glass-effect rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              Members ({members.length})
            </h3>
            {isAdmin && (
              <Button
                size="sm"
                onClick={handleOpenAddMember}
                className="gap-1"
              >
                <UserPlus className="w-4 h-4" />
                Add
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-background/50 transition-colors">
                <Avatar>
                  <AvatarImage src={member.profiles?.avatar_url || ""} />
                  <AvatarFallback>
                    {member.profiles?.full_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium">{member.profiles?.full_name}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {member.role}
                  </p>
                </div>
                {isAdmin && member.user_id !== currentUserId && (
                  <div className="flex gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(value) => updateMemberRole(member.id, value)}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() => removeMember(member.id, member.user_id)}
                    >
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add Members
            </DialogTitle>
          </DialogHeader>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {selectedUsers.size > 0 && (
            <p className="text-sm text-muted-foreground mb-2">
              {selectedUsers.size} selected
            </p>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 min-h-[200px]">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => toggleUserSelection(user.id)}
              >
                <Checkbox
                  checked={selectedUsers.has(user.id)}
                  onCheckedChange={() => toggleUserSelection(user.id)}
                />
                <Avatar className="w-10 h-10">
                  <AvatarImage src={user.avatar_url || ""} />
                  <AvatarFallback>{user.full_name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="font-medium">{user.full_name}</span>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No users found
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setAddMemberOpen(false);
                setSelectedUsers(new Set());
                setSearchQuery("");
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMembers}
              disabled={selectedUsers.size === 0 || addingMembers}
              className="flex-1"
            >
              {addingMembers ? "Adding..." : `Add (${selectedUsers.size})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupSettings;