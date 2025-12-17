-- Add status likes table
CREATE TABLE IF NOT EXISTS public.status_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status_id UUID NOT NULL REFERENCES public.statuses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(status_id, user_id)
);

-- Add status replies table
CREATE TABLE IF NOT EXISTS public.status_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status_id UUID NOT NULL REFERENCES public.statuses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.status_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_replies ENABLE ROW LEVEL SECURITY;

-- RLS policies for status_likes
CREATE POLICY "Users can like statuses" ON public.status_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view likes" ON public.status_likes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can unlike" ON public.status_likes
  FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for status_replies
CREATE POLICY "Users can reply to statuses" ON public.status_replies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Status owners can view replies" ON public.status_replies
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      user_id = auth.uid() OR
      EXISTS (SELECT 1 FROM statuses s WHERE s.id = status_id AND s.user_id = auth.uid())
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.status_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.status_replies;