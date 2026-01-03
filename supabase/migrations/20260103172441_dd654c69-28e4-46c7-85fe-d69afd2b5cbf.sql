-- PHASE 1: Create message_envelopes table for temporary message routing
-- Messages are stored here temporarily until delivered, then cleaned up

CREATE TABLE public.message_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  encrypted_payload TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  reply_to UUID,
  is_forwarded BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '48 hours'),
  delivered_at TIMESTAMP WITH TIME ZONE,
  is_delivered BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.message_envelopes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Sender can insert their own messages
CREATE POLICY "Senders can insert envelopes"
ON public.message_envelopes
FOR INSERT
WITH CHECK (sender_id = auth.uid());

-- Sender and receiver can view envelopes
CREATE POLICY "Participants can view envelopes"
ON public.message_envelopes
FOR SELECT
USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Sender can update their own envelopes (for editing)
CREATE POLICY "Senders can update envelopes"
ON public.message_envelopes
FOR UPDATE
USING (sender_id = auth.uid());

-- Both sender and receiver can delete (after delivery confirmation)
CREATE POLICY "Participants can delete envelopes"
ON public.message_envelopes
FOR DELETE
USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Create index for fast queries
CREATE INDEX idx_envelopes_receiver ON public.message_envelopes(receiver_id, is_delivered);
CREATE INDEX idx_envelopes_conversation ON public.message_envelopes(conversation_id);
CREATE INDEX idx_envelopes_expires ON public.message_envelopes(expires_at);

-- Enable realtime for instant delivery
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_envelopes;

-- Create delete_instructions table for "delete for everyone" feature
CREATE TABLE public.delete_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  initiated_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '7 days')
);

-- Enable RLS
ALTER TABLE public.delete_instructions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for delete_instructions
CREATE POLICY "Users can create delete instructions"
ON public.delete_instructions
FOR INSERT
WITH CHECK (initiated_by = auth.uid());

CREATE POLICY "Conversation participants can view delete instructions"
ON public.delete_instructions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = delete_instructions.conversation_id
    AND cp.user_id = auth.uid()
  )
);

-- Enable realtime for delete instructions
ALTER PUBLICATION supabase_realtime ADD TABLE public.delete_instructions;

-- Create cleanup function for expired envelopes
CREATE OR REPLACE FUNCTION public.cleanup_expired_envelopes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete expired envelopes (48h+ old)
  DELETE FROM public.message_envelopes WHERE expires_at < now();
  
  -- Delete delivered envelopes older than 1 hour
  DELETE FROM public.message_envelopes 
  WHERE is_delivered = true 
  AND delivered_at < (now() - INTERVAL '1 hour');
  
  -- Delete expired delete_instructions (7 days+)
  DELETE FROM public.delete_instructions WHERE expires_at < now();
END;
$$;