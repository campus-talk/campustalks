-- Create blocked_users table for user blocking
CREATE TABLE public.blocked_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- Disable RLS for now as per user request
ALTER TABLE public.blocked_users DISABLE ROW LEVEL SECURITY;

-- Create message_mentions table for @ mentions in groups
CREATE TABLE public.message_mentions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Disable RLS for now
ALTER TABLE public.message_mentions DISABLE ROW LEVEL SECURITY;