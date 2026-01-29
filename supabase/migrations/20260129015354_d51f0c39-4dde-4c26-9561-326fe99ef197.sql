-- Create active_calls table to track ongoing calls
CREATE TABLE public.active_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  room_name TEXT NOT NULL,
  call_type TEXT NOT NULL DEFAULT 'video', -- 'video' or 'audio'
  initiated_by UUID NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  participant_count INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.active_calls ENABLE ROW LEVEL SECURITY;

-- Allow conversation participants to view active calls
CREATE POLICY "Conversation participants can view active calls"
ON public.active_calls
FOR SELECT
USING (is_conversation_participant(conversation_id, auth.uid()));

-- Allow authenticated users to create calls in their conversations
CREATE POLICY "Users can create calls in their conversations"
ON public.active_calls
FOR INSERT
WITH CHECK (
  initiated_by = auth.uid() 
  AND is_conversation_participant(conversation_id, auth.uid())
);

-- Allow participants to update active calls
CREATE POLICY "Participants can update active calls"
ON public.active_calls
FOR UPDATE
USING (is_conversation_participant(conversation_id, auth.uid()));

-- Allow participants to delete/end active calls
CREATE POLICY "Participants can delete active calls"
ON public.active_calls
FOR DELETE
USING (is_conversation_participant(conversation_id, auth.uid()));

-- Create call_participants table for tracking who's in a call
CREATE TABLE public.call_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.active_calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  is_screen_sharing BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(call_id, user_id)
);

-- Enable RLS
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;

-- Policies for call_participants
CREATE POLICY "Call participants can view participants"
ON public.call_participants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.active_calls ac
    WHERE ac.id = call_id
    AND is_conversation_participant(ac.conversation_id, auth.uid())
  )
);

CREATE POLICY "Users can join calls"
ON public.call_participants
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.active_calls ac
    WHERE ac.id = call_id
    AND is_conversation_participant(ac.conversation_id, auth.uid())
  )
);

CREATE POLICY "Users can update their own participation"
ON public.call_participants
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can leave calls"
ON public.call_participants
FOR DELETE
USING (user_id = auth.uid());

-- Enable realtime for active_calls
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;