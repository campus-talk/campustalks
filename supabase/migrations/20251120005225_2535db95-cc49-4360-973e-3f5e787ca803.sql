-- Add remaining tables to realtime (conversations already exists)
DO $$
BEGIN
  -- Add conversation_participants if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'conversation_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
  END IF;

  -- Add message_reactions if not already in publication  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;