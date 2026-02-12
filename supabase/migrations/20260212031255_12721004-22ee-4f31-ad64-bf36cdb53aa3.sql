-- Allow 'voice' message type in the check constraint
ALTER TABLE public.messages DROP CONSTRAINT messages_message_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check 
  CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'call_log'::text, 'voice'::text]));

-- Add DELETE policy for chat-attachments so voice cleanup works
CREATE POLICY "Users can delete chat attachments in their conversations"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-attachments' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.user_id = auth.uid() 
    AND (storage.foldername(name))[1] = cp.conversation_id::text
  )
);