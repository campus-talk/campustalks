-- Create statuses table for Status/Stories feature
CREATE TABLE public.statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  media_type TEXT DEFAULT 'text', -- 'text', 'image', 'video'
  background_color TEXT DEFAULT '#0ea5a9',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Create status_views table to track who viewed statuses
CREATE TABLE public.status_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status_id UUID NOT NULL REFERENCES public.statuses(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(status_id, viewer_id)
);

-- Enable RLS
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies for statuses
CREATE POLICY "Users can create their own statuses"
ON public.statuses FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view all statuses from authenticated users"
ON public.statuses FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own statuses"
ON public.statuses FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for status_views
CREATE POLICY "Users can view status views for their own statuses"
ON public.status_views FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.statuses s 
  WHERE s.id = status_id AND s.user_id = auth.uid()
) OR viewer_id = auth.uid());

CREATE POLICY "Users can mark statuses as viewed"
ON public.status_views FOR INSERT
WITH CHECK (auth.uid() = viewer_id);

-- Enable realtime for statuses
ALTER PUBLICATION supabase_realtime ADD TABLE public.statuses;