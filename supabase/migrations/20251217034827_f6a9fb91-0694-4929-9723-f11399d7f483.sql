-- Add message content length validation
ALTER TABLE messages ADD CONSTRAINT message_content_length 
CHECK (char_length(content) <= 10000);

-- Make chat-attachments bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'chat-attachments';

-- Update storage policy for chat-attachments to restrict SELECT to conversation participants
DROP POLICY IF EXISTS "Authenticated users can view chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view chat attachments" ON storage.objects;

CREATE POLICY "Conversation participants can view chat attachments" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments' AND
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.user_id = auth.uid()
    AND (storage.foldername(name))[1] = cp.conversation_id::text
  )
);