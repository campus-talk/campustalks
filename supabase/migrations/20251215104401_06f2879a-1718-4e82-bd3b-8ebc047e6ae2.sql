-- Add DELETE policy for messages (users can delete their own messages)
CREATE POLICY "Users can delete their own messages" 
ON public.messages 
FOR DELETE 
USING (sender_id = auth.uid());

-- Create function to automatically delete expired statuses
CREATE OR REPLACE FUNCTION public.cleanup_expired_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.statuses WHERE expires_at < now();
END;
$$;

-- Create a function to cleanup old deleted messages (optional cleanup)
CREATE OR REPLACE FUNCTION public.cleanup_deleted_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messages WHERE deleted_for_everyone = true;
END;
$$;