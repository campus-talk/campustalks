-- Drop the existing complex INSERT policy on conversation_participants
DROP POLICY IF EXISTS "Users can add participants to conversations" ON conversation_participants;

-- Simple policy: User can add themselves as participant
CREATE POLICY "User can add self as participant"
ON conversation_participants
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
);

-- Allow user to add receiver to a NEW conversation (no existing participants yet)
CREATE POLICY "Creator can add receiver to new conversation"
ON conversation_participants
FOR INSERT
WITH CHECK (
  -- User can message this person
  can_message_user(auth.uid(), user_id)
  AND
  -- User is already a participant (they added themselves first)
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = conversation_participants.conversation_id
    AND cp.user_id = auth.uid()
  )
);