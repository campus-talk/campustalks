import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Camera, Save, LogOut, UserX, ChevronRight, Phone, Bot, Globe, Lock, MessageCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BlockedUsersList from "@/components/BlockedUsersList";
import UpdatePhoneDialog from "@/components/UpdatePhoneDialog";
import { useAppStore } from "@/stores/appStore";

const SettingsTab = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { currentUserProfile, pendingRequests, fetchCounts } = useAppStore();
  
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [blockedUsersOpen, setBlockedUsersOpen] = useState(false);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [profileId, setProfileId] = useState("");

  useEffect(() => {
    loadProfile();
    fetchCounts();
  }, [fetchCounts]);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "Failed to load profile",
      });
      return;
    }

    setProfileId(data.id);
    setFullName(data.full_name);
    setUsername(data.username || "");
    setBio(data.bio || "");
    setStatus(data.status || "Available");
    setAvatarPreview(data.avatar_url || "");
    setUserPhone(data.phone || null);
    setIsPrivate(data.is_private || false);
  };

  const handlePrivacyToggle = async (checked: boolean) => {
    if (!profileId) return;
    setIsPrivate(checked);

    const { error } = await supabase
      .from("profiles")
      .update({ is_private: checked })
      .eq("id", profileId);

    if (error) {
      setIsPrivate(!checked);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } else {
      toast({
        title: checked ? "Account set to Private" : "Account set to Public",
        description: checked
          ? "New people must send a request to message you"
          : "Anyone can message you now",
      });
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!profileId) return;

    setLoading(true);
    try {
      let avatarUrl = avatarPreview;

      if (avatarFile) {
        const fileExt = avatarFile.name.split(".").pop();
        const fileName = `${profileId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, avatarFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName);

        avatarUrl = publicUrl;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          username: username.toLowerCase().replace(/[^a-z0-9_]/g, '') || null,
          bio: bio || null,
          status,
          avatar_url: avatarUrl,
        })
        .eq("id", profileId);

      if (error) throw error;

      toast({
        title: "Profile updated!",
        description: "Your changes have been saved.",
      });
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen geometric-pattern pb-24">
      <header className="gradient-primary text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-effect rounded-3xl p-8"
        >
          <div className="space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <Avatar className="w-24 h-24 border-4 border-primary/20">
                  <AvatarImage src={avatarPreview} />
                  <AvatarFallback className="bg-gradient-primary text-white text-2xl">
                    {fullName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <label
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 gradient-primary rounded-full p-2 cursor-pointer hover:scale-110 transition-transform shadow-lg"
                >
                  <Camera className="w-4 h-4 text-white" />
                </label>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Unique Key Display */}
            <div className="text-center p-4 rounded-xl bg-muted/50">
              <p className="text-sm text-muted-foreground mb-1">Your Unique Code</p>
              <p className="font-mono font-bold text-lg text-primary">
                {currentUserProfile?.unique_key}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-background/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="username"
                  className="bg-background/50 pl-8"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Only lowercase letters, numbers and underscores
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Input
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="Available"
                className="bg-background/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
                className="bg-background/50 resize-none"
                rows={4}
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={loading}
              className="w-full gradient-primary hover:gradient-primary-hover text-white font-semibold"
              size="lg"
            >
              <Save className="w-5 h-5 mr-2" />
              {loading ? "Saving..." : "Save Changes"}
            </Button>

            {/* Privacy Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-background/50">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${isPrivate ? "bg-amber-500/10" : "bg-green-500/10"}`}>
                  {isPrivate ? (
                    <Lock className="w-5 h-5 text-amber-500" />
                  ) : (
                    <Globe className="w-5 h-5 text-green-500" />
                  )}
                </div>
                <div className="text-left">
                  <span className="font-medium block">Private Account</span>
                  <span className="text-sm text-muted-foreground">
                    {isPrivate ? "Only approved users can message you" : "Anyone can message you"}
                  </span>
                </div>
              </div>
              <Switch checked={isPrivate} onCheckedChange={handlePrivacyToggle} />
            </div>

            {/* Message Requests */}
            <button
              onClick={() => navigate("/message-requests")}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-background/50 hover:bg-background/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-500/10">
                  <MessageCircle className="w-5 h-5 text-blue-500" />
                </div>
                <div className="text-left">
                  <span className="font-medium block">Message Requests</span>
                  <span className="text-sm text-muted-foreground">
                    {pendingRequests > 0 ? `${pendingRequests} pending` : "No pending requests"}
                  </span>
                </div>
              </div>
              {pendingRequests > 0 && (
                <span className="bg-primary text-primary-foreground text-xs rounded-full min-w-5 h-5 flex items-center justify-center px-1.5 font-bold mr-2">
                  {pendingRequests}
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* AI Assistant Section */}
            <button
              onClick={() => navigate("/settings/ai")}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-background/50 hover:bg-background/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-purple-500/10">
                  <Bot className="w-5 h-5 text-purple-500" />
                </div>
                <div className="text-left">
                  <span className="font-medium block">AI Assistant</span>
                  <span className="text-sm text-muted-foreground">
                    Smart replies, auto-reply & more
                  </span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Phone Number Section */}
            <button
              onClick={() => setPhoneDialogOpen(true)}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-background/50 hover:bg-background/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <span className="font-medium block">Phone Number</span>
                  <span className="text-sm text-muted-foreground">
                    {userPhone || "Not added"}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Blocked Users Section */}
            <button
              onClick={() => setBlockedUsersOpen(true)}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-background/50 hover:bg-background/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-destructive/10">
                  <UserX className="w-5 h-5 text-destructive" />
                </div>
                <span className="font-medium">Blocked Users</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Logout
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Blocked Users Dialog */}
      <Dialog open={blockedUsersOpen} onOpenChange={setBlockedUsersOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserX className="w-5 h-5" />
              Blocked Users
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {profileId && <BlockedUsersList currentUserId={profileId} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Phone Update Dialog */}
      <UpdatePhoneDialog
        open={phoneDialogOpen}
        onOpenChange={setPhoneDialogOpen}
        currentPhone={userPhone}
        userId={profileId || ""}
        onPhoneUpdated={(phone) => setUserPhone(phone)}
      />
    </div>
  );
};

export default SettingsTab;
