-- Add group settings and permissions
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{
  "who_can_send_messages": "everyone",
  "who_can_edit_group_info": "admins",
  "send_messages_permission": "everyone"
}'::jsonb;

-- Create call_logs table for tracking all calls
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
  call_status TEXT NOT NULL CHECK (call_status IN ('missed', 'answered', 'declined', 'cancelled')),
  duration_seconds INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Disable RLS for call_logs (public access as per user requirement)
ALTER TABLE public.call_logs DISABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_call_logs_caller ON public.call_logs(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_receiver ON public.call_logs(receiver_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_conversation ON public.call_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON public.call_logs(created_at DESC);