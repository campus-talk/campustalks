import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Sparkles, ShieldAlert, Bell, Bot, Zap, Brain, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAISettings } from "@/hooks/useAISettings";
import BottomNav from "@/components/BottomNav";

const AISettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { settings, loading, updateSettings } = useAISettings();
  
  const [localSettings, setLocalSettings] = useState({
    emotion_filter_enabled: true,
    emotion_filter_strictness: "medium" as "low" | "medium" | "high",
    smart_replies_enabled: true,
    suspicious_warnings_enabled: true,
    smart_reminders_enabled: true,
    ai_model_preference: "auto" as "auto" | "fast" | "quality",
    ai_personality_prompt: "",
    ai_about_me: "",
    auto_reply_enabled: false,
    auto_reply_prompt: "",
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        emotion_filter_enabled: settings.emotion_filter_enabled,
        emotion_filter_strictness: settings.emotion_filter_strictness,
        smart_replies_enabled: settings.smart_replies_enabled,
        suspicious_warnings_enabled: settings.suspicious_warnings_enabled,
        smart_reminders_enabled: settings.smart_reminders_enabled,
        ai_model_preference: settings.ai_model_preference,
        ai_personality_prompt: settings.ai_personality_prompt || "",
        ai_about_me: settings.ai_about_me || "",
        auto_reply_enabled: settings.auto_reply_enabled,
        auto_reply_prompt: settings.auto_reply_prompt || "",
      });
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings(localSettings);
      toast({
        title: "Settings Saved",
        description: "Your AI preferences have been updated.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings. Please try again.",
      });
    }
  };

  const handleToggle = (key: string, value: boolean) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen geometric-pattern pb-24">
      <header className="gradient-primary text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => navigate("/settings")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">AI & Smart Features</h1>
            <p className="text-sm opacity-80">Customize your AI assistant</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Message Safety */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="w-5 h-5 text-amber-500" />
                Message Safety
              </CardTitle>
              <CardDescription>
                Get warnings before sending harsh messages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="emotion-filter">Emotion Filter</Label>
                <Switch
                  id="emotion-filter"
                  checked={localSettings.emotion_filter_enabled}
                  onCheckedChange={(v) => handleToggle("emotion_filter_enabled", v)}
                />
              </div>
              
              {localSettings.emotion_filter_enabled && (
                <div className="space-y-2">
                  <Label>Strictness Level</Label>
                  <Select
                    value={localSettings.emotion_filter_strictness}
                    onValueChange={(v: "low" | "medium" | "high") =>
                      setLocalSettings(prev => ({ ...prev, emotion_filter_strictness: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low - Only extreme messages</SelectItem>
                      <SelectItem value="medium">Medium - Balanced (Default)</SelectItem>
                      <SelectItem value="high">High - Even mild rudeness</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Smart Replies */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="w-5 h-5 text-primary" />
                Smart Replies
              </CardTitle>
              <CardDescription>
                Show quick AI-suggested replies in chat
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="smart-replies">Enable Smart Replies</Label>
                <Switch
                  id="smart-replies"
                  checked={localSettings.smart_replies_enabled}
                  onCheckedChange={(v) => handleToggle("smart_replies_enabled", v)}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Suspicious Warnings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                Suspicious Message Warnings
              </CardTitle>
              <CardDescription>
                Get warnings when messages look like spam or scam
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="suspicious-warnings">Enable Warnings</Label>
                <Switch
                  id="suspicious-warnings"
                  checked={localSettings.suspicious_warnings_enabled}
                  onCheckedChange={(v) => handleToggle("suspicious_warnings_enabled", v)}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Smart Reminders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="w-5 h-5 text-blue-500" />
                Smart Reminders
              </CardTitle>
              <CardDescription>
                Suggest reminders based on chat messages mentioning tasks or dates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="smart-reminders">Enable Reminders</Label>
                <Switch
                  id="smart-reminders"
                  checked={localSettings.smart_reminders_enabled}
                  onCheckedChange={(v) => handleToggle("smart_reminders_enabled", v)}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Auto Reply */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bot className="w-5 h-5 text-green-500" />
                AI Auto-Reply
              </CardTitle>
              <CardDescription>
                Automatically reply when you're offline
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-reply">Enable Auto-Reply</Label>
                <Switch
                  id="auto-reply"
                  checked={localSettings.auto_reply_enabled}
                  onCheckedChange={(v) => handleToggle("auto_reply_enabled", v)}
                />
              </div>
              
              {localSettings.auto_reply_enabled && (
                <div className="space-y-2">
                  <Label>Auto-Reply Instructions</Label>
                  <Textarea
                    value={localSettings.auto_reply_prompt}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, auto_reply_prompt: e.target.value }))}
                    placeholder="e.g., You are a helpful assistant. Reply politely and let them know I'll respond soon."
                    rows={3}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* AI Model & Personality */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Brain className="w-5 h-5 text-purple-500" />
                AI Personality & Preferences
              </CardTitle>
              <CardDescription>
                Customize how the AI responds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Model Preference</Label>
                <Select
                  value={localSettings.ai_model_preference}
                  onValueChange={(v: "auto" | "fast" | "quality") =>
                    setLocalSettings(prev => ({ ...prev, ai_model_preference: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      <span className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-500" />
                        Auto (Recommended)
                      </span>
                    </SelectItem>
                    <SelectItem value="fast">
                      <span className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-blue-500" />
                        Fast - Quicker responses
                      </span>
                    </SelectItem>
                    <SelectItem value="quality">
                      <span className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-500" />
                        Quality - Better accuracy
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tell the AI how to behave</Label>
                <Textarea
                  value={localSettings.ai_personality_prompt}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, ai_personality_prompt: e.target.value }))}
                  placeholder="e.g., Be short and direct, no emojis, reply in Hinglish."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  This will affect smart replies and auto-reply tone
                </p>
              </div>

              <div className="space-y-2">
                <Label>About Me</Label>
                <Textarea
                  value={localSettings.ai_about_me}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, ai_about_me: e.target.value }))}
                  placeholder="e.g., I am a student, I like logical explanations, don't sugarcoat."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Help the AI understand your style for better personalization
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Button
            onClick={handleSave}
            className="w-full gradient-primary text-white font-semibold"
            size="lg"
          >
            Save AI Settings
          </Button>
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
};

export default AISettings;
