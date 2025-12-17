-- First, create helper functions to avoid RLS infinite recursion

-- Function to check if user is a group member (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = _group_id
      AND user_id = _user_id
  )
$$;

-- Function to check if user is a group admin (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = _group_id
      AND user_id = _user_id
      AND role = 'admin'
  )
$$;

-- ==========================================
-- ENABLE RLS ON ALL 6 TABLES
-- ==========================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_mentions ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- CONVERSATIONS POLICIES
-- ==========================================
CREATE POLICY "Users can view their conversations"
ON public.conversations FOR SELECT
USING (
  public.is_conversation_participant(id, auth.uid())
);

CREATE POLICY "Users can create conversations"
ON public.conversations FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Participants can update conversations"
ON public.conversations FOR UPDATE
USING (public.is_conversation_participant(id, auth.uid()));

-- ==========================================
-- CALL_LOGS POLICIES
-- ==========================================
CREATE POLICY "Users can view their calls"
ON public.call_logs FOR SELECT
USING (
  caller_id = auth.uid() 
  OR receiver_id = auth.uid()
);

CREATE POLICY "Users can create call logs"
ON public.call_logs FOR INSERT
WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Call participants can update calls"
ON public.call_logs FOR UPDATE
USING (caller_id = auth.uid() OR receiver_id = auth.uid());

-- ==========================================
-- GROUPS POLICIES
-- ==========================================
CREATE POLICY "Group members can view groups"
ON public.groups FOR SELECT
USING (public.is_group_member(id, auth.uid()));

CREATE POLICY "Users can create groups"
ON public.groups FOR INSERT
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Group admins can update groups"
ON public.groups FOR UPDATE
USING (public.is_group_admin(id, auth.uid()));

CREATE POLICY "Group admins can delete groups"
ON public.groups FOR DELETE
USING (public.is_group_admin(id, auth.uid()));

-- ==========================================
-- GROUP_MEMBERS POLICIES
-- ==========================================
CREATE POLICY "Group members can view membership"
ON public.group_members FOR SELECT
USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Group admins can add members"
ON public.group_members FOR INSERT
WITH CHECK (
  public.is_group_admin(group_id, auth.uid())
  OR (user_id = auth.uid() AND public.is_group_admin(group_id, auth.uid()) = false AND NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_members.group_id))
);

CREATE POLICY "Group admins can update member roles"
ON public.group_members FOR UPDATE
USING (public.is_group_admin(group_id, auth.uid()));

CREATE POLICY "Group admins can remove members or users can leave"
ON public.group_members FOR DELETE
USING (
  public.is_group_admin(group_id, auth.uid())
  OR user_id = auth.uid()
);

-- ==========================================
-- BLOCKED_USERS POLICIES (CRITICAL - only blocker can see)
-- ==========================================
CREATE POLICY "Users can only view their own blocks"
ON public.blocked_users FOR SELECT
USING (blocker_id = auth.uid());

CREATE POLICY "Users can block others"
ON public.blocked_users FOR INSERT
WITH CHECK (blocker_id = auth.uid() AND blocked_id != auth.uid());

CREATE POLICY "Users can unblock"
ON public.blocked_users FOR DELETE
USING (blocker_id = auth.uid());

-- ==========================================
-- MESSAGE_MENTIONS POLICIES
-- ==========================================
CREATE POLICY "Conversation participants can view mentions"
ON public.message_mentions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_mentions.message_id
    AND public.is_conversation_participant(m.conversation_id, auth.uid())
  )
);

CREATE POLICY "Message senders can create mentions"
ON public.message_mentions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_mentions.message_id
    AND m.sender_id = auth.uid()
  )
);