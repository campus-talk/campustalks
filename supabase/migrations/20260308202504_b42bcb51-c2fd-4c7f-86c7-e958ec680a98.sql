
-- Allow group creators to add participants to group conversations
CREATE POLICY "Group creator can add participants to group conversations"
ON public.conversation_participants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.groups g ON g.id = c.group_id
    WHERE c.id = conversation_participants.conversation_id
      AND c.is_group = true
      AND g.created_by = auth.uid()
  )
);
