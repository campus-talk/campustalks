-- Add starred_messages table for starring messages
CREATE TABLE public.starred_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Enable RLS on starred_messages
ALTER TABLE public.starred_messages ENABLE ROW LEVEL SECURITY;

-- Policies for starred_messages
CREATE POLICY "Users can view their own starred messages"
ON public.starred_messages FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can star messages"
ON public.starred_messages FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unstar messages"
ON public.starred_messages FOR DELETE
USING (user_id = auth.uid());

-- Add scheduled_at column to messages for scheduled messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add is_forwarded column to track forwarded messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN DEFAULT false;

-- Add disappearing_at column for disappearing messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS disappearing_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Enable realtime for starred_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.starred_messages;