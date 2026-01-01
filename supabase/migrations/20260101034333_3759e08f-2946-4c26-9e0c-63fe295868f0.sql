-- Add is_private column to profiles (default public)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;

-- Create message_requests table for private accounts
CREATE TABLE IF NOT EXISTS public.message_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(requester_id, recipient_id)
);

-- Enable RLS
ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for message_requests
CREATE POLICY "Users can view their own requests (sent or received)"
ON public.message_requests FOR SELECT
USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can create message requests"
ON public.message_requests FOR INSERT
WITH CHECK (auth.uid() = requester_id AND requester_id <> recipient_id);

CREATE POLICY "Recipients can update request status"
ON public.message_requests FOR UPDATE
USING (auth.uid() = recipient_id);

CREATE POLICY "Users can delete their own sent requests"
ON public.message_requests FOR DELETE
USING (auth.uid() = requester_id);

-- Create helper function to check if user can message another user
CREATE OR REPLACE FUNCTION public.can_message_user(_sender_id uuid, _recipient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Same user can always "message" themselves (edge case)
    _sender_id = _recipient_id
    OR
    -- Recipient is public account
    NOT EXISTS (SELECT 1 FROM profiles WHERE id = _recipient_id AND is_private = true)
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
    -- Already have a conversation together (legacy)
    EXISTS (
      SELECT 1 FROM conversation_participants cp1
      JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
      WHERE cp1.user_id = _sender_id AND cp2.user_id = _recipient_id
    )
$$;

-- Update conversation_participants INSERT policy to allow adding other user if can_message
DROP POLICY IF EXISTS "Users can add participants to conversations" ON public.conversation_participants;

CREATE POLICY "Users can add participants to conversations"
ON public.conversation_participants FOR INSERT
WITH CHECK (
  -- Adding themselves
  user_id = auth.uid()
  OR
  -- Adding someone they can message (empty conversation or first participant)
  (
    can_message_user(auth.uid(), user_id)
    AND (
      -- User is already a participant in this conversation
      EXISTS (
        SELECT 1 FROM conversation_participants 
        WHERE conversation_id = conversation_participants.conversation_id 
        AND user_id = auth.uid()
      )
      OR
      -- No participants yet (new conversation)
      NOT EXISTS (
        SELECT 1 FROM conversation_participants cp 
        WHERE cp.conversation_id = conversation_participants.conversation_id
      )
    )
  )
);

-- Add realtime for message_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_requests;