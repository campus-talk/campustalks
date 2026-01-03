-- Drop the broken INSERT policy
DROP POLICY IF EXISTS "Users can add participants to conversations" ON conversation_participants;

-- Create corrected INSERT policy
-- User can add participant if:
-- 1. They're adding themselves (user_id = auth.uid())
-- 2. OR they can message the user AND (they're already in the conversation OR the conversation is brand new)
CREATE POLICY "Users can add participants to conversations" 
ON conversation_participants 
FOR INSERT 
WITH CHECK (
  -- User adding themselves
  (user_id = auth.uid())
  OR 
  -- User adding someone else they can message
  (
    can_message_user(auth.uid(), user_id) 
    AND (
      -- Current user is already a participant in this conversation
      EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
        AND cp.user_id = auth.uid()
      )
      OR 
      -- This is a brand new conversation (no participants yet)
      NOT EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
      )
    )
  )
);