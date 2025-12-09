import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AISettings } from "./useAISettings";

interface ToneGuardResult {
  sentiment: "positive" | "neutral" | "negative";
  toxicity: "none" | "mild" | "medium" | "high";
  shouldWarn: boolean;
  reason?: string;
}

interface SmartReplyResult {
  replies: string[];
}

interface SpamDetectionResult {
  isSuspicious: boolean;
  flagType: "spam" | "scam" | "abuse" | "suspicious" | null;
  confidence: number;
  reason?: string;
}

interface ReminderDetectionResult {
  hasReminder: boolean;
  suggestedTitle: string | null;
  suggestedTime: string | null;
  confidence: number;
}

export const useAIAssistant = (settings: AISettings | null) => {
  const [loading, setLoading] = useState(false);

  const callAI = async (
    type: string,
    message: string,
    extraContext?: Record<string, unknown>
  ) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          type,
          message,
          context: {
            userPreferences: {
              personality: settings?.ai_personality_prompt,
              aboutMe: settings?.ai_about_me,
              strictness: settings?.emotion_filter_strictness,
            },
            modelPreference: settings?.ai_model_preference,
            ...extraContext,
          },
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`AI ${type} error:`, error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const checkToneGuard = async (message: string): Promise<ToneGuardResult | null> => {
    if (!settings?.emotion_filter_enabled) return null;
    const result = await callAI("tone_guard", message);
    return result?.success ? result.data : null;
  };

  const getSoftenedMessage = async (message: string): Promise<string | null> => {
    const result = await callAI("soften_message", message);
    return result?.success ? result.data : null;
  };

  const getSmartReplies = async (message: string): Promise<string[]> => {
    if (!settings?.smart_replies_enabled) return [];
    const result = await callAI("smart_reply", message);
    if (result?.success && result.data?.replies) {
      return result.data.replies;
    }
    return [];
  };

  const checkSpam = async (message: string): Promise<SpamDetectionResult | null> => {
    if (!settings?.suspicious_warnings_enabled) return null;
    const result = await callAI("spam_detection", message);
    return result?.success ? result.data : null;
  };

  const detectReminder = async (message: string): Promise<ReminderDetectionResult | null> => {
    if (!settings?.smart_reminders_enabled) return null;
    const result = await callAI("reminder_detection", message);
    return result?.success ? result.data : null;
  };

  const getAutoReply = async (
    message: string,
    conversationHistory?: string[]
  ): Promise<string | null> => {
    if (!settings?.auto_reply_enabled) return null;
    const result = await callAI("auto_reply", message, { conversationHistory });
    return result?.success ? result.data : null;
  };

  return {
    loading,
    checkToneGuard,
    getSoftenedMessage,
    getSmartReplies,
    checkSpam,
    detectReminder,
    getAutoReply,
  };
};
