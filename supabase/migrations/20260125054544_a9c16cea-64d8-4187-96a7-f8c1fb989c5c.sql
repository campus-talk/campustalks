-- Fix unread badge issue by enabling receiver-side read updates via a SECURITY DEFINER RPC
-- We keep direct UPDATE permissions on messages restricted (sender-only) and expose a safe function.

CREATE OR REPLACE FUNCTION public.mark_conversation_read(conversation_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_count integer := 0;
BEGIN
  -- Must be logged in
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Must be a participant
  IF NOT public.is_conversation_participant(conversation_uuid, auth.uid()) THEN
    RAISE EXCEPTION 'not a participant';
  END IF;

  -- Mark as read: for this user, unread messages are those NOT sent by them.
  UPDATE public.messages
  SET is_read = true
  WHERE conversation_id = conversation_uuid
    AND sender_id <> auth.uid()
    AND COALESCE(is_read, false) = false;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
