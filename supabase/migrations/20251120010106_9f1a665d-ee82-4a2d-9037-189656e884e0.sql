-- Completely disable RLS on conversations table
-- This allows authenticated users to create conversations freely
ALTER TABLE public.conversations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies on conversations
DROP POLICY IF EXISTS "allow_authenticated_insert_conversations" ON public.conversations;
DROP POLICY IF EXISTS "allow_authenticated_select_conversations" ON public.conversations;