-- Tighten overly-permissive notifications INSERT policy (was WITH CHECK true)
DO $$
BEGIN
  -- Drop the permissive policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'Users can insert notifications for others'
  ) THEN
    EXECUTE 'DROP POLICY "Users can insert notifications for others" ON public.notifications';
  END IF;
END $$;

-- Allow authenticated users to insert notifications only when they are the sender
CREATE POLICY "Users can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND sender_id = auth.uid()
);
