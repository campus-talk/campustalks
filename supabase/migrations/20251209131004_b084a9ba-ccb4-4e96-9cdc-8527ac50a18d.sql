
-- Create the update_updated_at_column function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create AI settings table for user preferences
CREATE TABLE public.ai_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  emotion_filter_enabled BOOLEAN DEFAULT true,
  emotion_filter_strictness TEXT DEFAULT 'medium' CHECK (emotion_filter_strictness IN ('low', 'medium', 'high')),
  smart_replies_enabled BOOLEAN DEFAULT true,
  suspicious_warnings_enabled BOOLEAN DEFAULT true,
  smart_reminders_enabled BOOLEAN DEFAULT true,
  ai_model_preference TEXT DEFAULT 'auto' CHECK (ai_model_preference IN ('auto', 'fast', 'quality')),
  ai_personality_prompt TEXT,
  ai_about_me TEXT,
  auto_reply_enabled BOOLEAN DEFAULT false,
  auto_reply_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create reminders table
CREATE TABLE public.reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID,
  message_id UUID,
  title TEXT NOT NULL,
  reminder_time TIMESTAMP WITH TIME ZONE NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create flagged messages table for spam detection
CREATE TABLE public.flagged_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL UNIQUE,
  flag_type TEXT NOT NULL CHECK (flag_type IN ('spam', 'scam', 'abuse', 'suspicious')),
  confidence DECIMAL(3,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flagged_messages ENABLE ROW LEVEL SECURITY;

-- AI Settings policies
CREATE POLICY "Users can view their own AI settings"
ON public.ai_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI settings"
ON public.ai_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI settings"
ON public.ai_settings FOR UPDATE
USING (auth.uid() = user_id);

-- Reminders policies
CREATE POLICY "Users can view their own reminders"
ON public.reminders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reminders"
ON public.reminders FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reminders"
ON public.reminders FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reminders"
ON public.reminders FOR DELETE
USING (auth.uid() = user_id);

-- Flagged messages policies
CREATE POLICY "Users can view flagged messages in their conversations"
ON public.flagged_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM messages m
  JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
  WHERE m.id = flagged_messages.message_id AND cp.user_id = auth.uid()
));

-- Trigger for updating ai_settings timestamp
CREATE TRIGGER update_ai_settings_updated_at
BEFORE UPDATE ON public.ai_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
