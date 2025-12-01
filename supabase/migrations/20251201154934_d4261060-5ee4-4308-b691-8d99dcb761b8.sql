ALTER TABLE public.messages ADD COLUMN reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN deleted_for_everyone boolean DEFAULT false;
CREATE INDEX idx_messages_reply_to ON public.messages(reply_to);