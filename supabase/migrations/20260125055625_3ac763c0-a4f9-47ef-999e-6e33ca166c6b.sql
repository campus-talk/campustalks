-- =============================================================================
-- FIX: New users unable to message due to permission errors
-- Simplify participant insertion policies so any authenticated user can message
-- any other user (public accounts). Keep can_message_user for private accounts.
-- =============================================================================

-- Drop existing policies on conversation_participants that may be blocking
DROP POLICY IF EXISTS "User can add self as participant" ON conversation_participants;
DROP POLICY IF EXISTS "Creator can add receiver to new conversation" ON conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to conversations" ON conversation_participants;

-- Simple, permissive policy: Authenticated users can add themselves
CREATE POLICY "User can add self as participant"
ON conversation_participants
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
);

-- Allow adding receiver after creator has joined (uses can_message_user for private checks)
CREATE POLICY "Creator can add receiver to conversation"
ON conversation_participants
FOR INSERT
TO authenticated
WITH CHECK (
  -- Must be able to message this user (public account OR accepted request)
  can_message_user(auth.uid(), user_id)
  AND
  -- Creator must already be a participant (they added themselves first)
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = conversation_participants.conversation_id
    AND cp.user_id = auth.uid()
  )
);

-- =============================================================================
-- Update can_message_user function to be more permissive for public accounts
-- =============================================================================
CREATE OR REPLACE FUNCTION public.can_message_user(_sender_id uuid, _recipient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Same user can always "message" themselves
    _sender_id = _recipient_id
    OR
    -- Recipient is a PUBLIC account (is_private is false or NULL)
    NOT COALESCE((SELECT is_private FROM profiles WHERE id = _recipient_id), false)
    OR
    -- Sender has an accepted request with recipient
    EXISTS (
      SELECT 1 FROM message_requests 
      WHERE requester_id = _sender_id 
        AND recipient_id = _recipient_id 
        AND status = 'accepted'
    )
    OR
    -- Recipient sent request to sender and it was accepted (mutual)
    EXISTS (
      SELECT 1 FROM message_requests 
      WHERE requester_id = _recipient_id 
        AND recipient_id = _sender_id 
        AND status = 'accepted'
    )
    OR
    -- Already have a conversation together
    EXISTS (
      SELECT 1 FROM conversation_participants cp1
      JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
      WHERE cp1.user_id = _sender_id AND cp2.user_id = _recipient_id
    )
$$;