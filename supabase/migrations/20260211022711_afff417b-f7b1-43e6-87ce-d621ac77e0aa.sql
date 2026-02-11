-- Enable full replica identity on messages table so DELETE events include the old row data
ALTER TABLE public.messages REPLICA IDENTITY FULL;