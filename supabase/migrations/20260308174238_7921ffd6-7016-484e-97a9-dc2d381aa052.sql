
-- Drop the broken INSERT policy on group_members
DROP POLICY IF EXISTS "Group admins can add members" ON public.group_members;

-- Create a fixed INSERT policy that allows:
-- 1. Group admins to add anyone
-- 2. Group creators to add themselves + initial members (when group was just created by them)
CREATE POLICY "Group admins or creators can add members"
ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (
  is_group_admin(group_id, auth.uid())
  OR
  (
    -- Allow the group creator to add initial members (including themselves)
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_id AND created_by = auth.uid()
    )
  )
);
