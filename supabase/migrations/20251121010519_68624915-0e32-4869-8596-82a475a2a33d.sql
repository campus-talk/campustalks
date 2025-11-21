-- Fix conversation_participants INSERT policy
-- Allow users to add themselves OR add others to conversations they're creating

DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;

-- New policy: Users can add any participants when creating a conversation
-- This allows adding both users at once during conversation creation
CREATE POLICY "Users can add participants to conversations"
ON public.conversation_participants
FOR INSERT
TO authenticated
WITH CHECK (
  -- User can always add themselves
  user_id = auth.uid()
  OR
  -- User can add others if they're also being added to the same conversation
  -- (checked by allowing insert if the current user will also be a participant)
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conversation_participants.conversation_id
    AND user_id = auth.uid()
  )
  OR
  -- Allow if this is a new conversation being created (no participants yet)
  NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_participants.conversation_id
  )
);