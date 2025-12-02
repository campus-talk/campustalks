import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, UserPlus, UserMinus, Shield, Settings, Users } from "lucide-react";

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

const GroupSettings = ({ groupId, currentUserId, onClose }: GroupSettingsProps) => {
  const { toast } = useToast();
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Members ({members.length})
          </h3>
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
                      <SelectTrigger className="w-32">
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
    </div>
  );
};

export default GroupSettings;