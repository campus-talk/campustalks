-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view their conversation participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;

-- Create security definer functions to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conversation_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = conversation_uuid
      AND user_id = user_uuid
  );
$$;

-- Enable INSERT on conversations for authenticated users
CREATE POLICY "Authenticated users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to view conversations they're part of
CREATE POLICY "Users can view their conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (public.is_conversation_participant(id, auth.uid()));

-- Allow users to add participants to conversations they're part of
CREATE POLICY "Users can add participants to their conversations"
ON public.conversation_participants
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_conversation_participant(conversation_id, auth.uid()) 
  OR user_id = auth.uid()
);

-- Allow users to view participants in their conversations
CREATE POLICY "Users can view their conversation participants"
ON public.conversation_participants
FOR SELECT
TO authenticated
USING (
  public.is_conversation_participant(conversation_id, auth.uid())
);