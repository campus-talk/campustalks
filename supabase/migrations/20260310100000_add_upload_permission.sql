-- Add INSERT policy for chat-attachments to allow uploads
CREATE POLICY "Users can upload chat attachments in their conversations"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.user_id = auth.uid()
    AND (storage.foldername(name))[1] = cp.conversation_id::text
  )
);
