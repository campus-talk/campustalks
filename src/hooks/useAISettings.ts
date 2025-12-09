import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AISettings {
  id: string;
  user_id: string;
  emotion_filter_enabled: boolean;
  emotion_filter_strictness: "low" | "medium" | "high";
  smart_replies_enabled: boolean;
  suspicious_warnings_enabled: boolean;
  smart_reminders_enabled: boolean;
  ai_model_preference: "auto" | "fast" | "quality";
  ai_personality_prompt: string | null;
  ai_about_me: string | null;
  auto_reply_enabled: boolean;
  auto_reply_prompt: string | null;
}

const defaultSettings: Omit<AISettings, "id" | "user_id"> = {
  emotion_filter_enabled: true,
  emotion_filter_strictness: "medium",
  smart_replies_enabled: true,
  suspicious_warnings_enabled: true,
  smart_reminders_enabled: true,
  ai_model_preference: "auto",
  ai_personality_prompt: null,
  ai_about_me: null,
  auto_reply_enabled: false,
  auto_reply_prompt: null,
};

export const useAISettings = () => {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("ai_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code === "PGRST116") {
        // No settings exist, create defaults
        const { data: newSettings, error: insertError } = await supabase
          .from("ai_settings")
          .insert({ user_id: user.id, ...defaultSettings })
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings(newSettings as AISettings);
      } else if (error) {
        throw error;
      } else {
        setSettings(data as AISettings);
      }
    } catch (error) {
      console.error("Error loading AI settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<AISettings>) => {
    if (!settings) return;

    try {
      const { error } = await supabase
        .from("ai_settings")
        .update(updates)
        .eq("id", settings.id);

      if (error) throw error;
      setSettings({ ...settings, ...updates });
    } catch (error) {
      console.error("Error updating AI settings:", error);
      throw error;
    }
  };

  return { settings, loading, updateSettings, refetch: loadSettings };
};
