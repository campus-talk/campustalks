-- Create groups table for WhatsApp-style group chats
CREATE TABLE public.groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  avatar_url text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Create group_members table
CREATE TABLE public.group_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamp with time zone DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Add group_id column to conversations to link groups
ALTER TABLE public.conversations 
ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
ADD COLUMN is_group boolean DEFAULT false;

-- Disable RLS on groups and group_members for public access (as per user request)
ALTER TABLE public.groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members DISABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX idx_groups_created_by ON public.groups(created_by);
CREATE INDEX idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX idx_conversations_group_id ON public.conversations(group_id);