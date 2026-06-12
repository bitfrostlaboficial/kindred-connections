CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.is_group_member(_group_id uuid, _user_id uuid)
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
  );
$$;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;
REVOKE ALL ON FUNCTION app_private.is_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_group_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members manage memberships of own groups" ON public.group_members;
DROP POLICY IF EXISTS "Members see their memberships" ON public.group_members;
DROP POLICY IF EXISTS "Update own groups" ON public.groups;
DROP POLICY IF EXISTS "View groups I'm member of" ON public.groups;
DROP POLICY IF EXISTS "Participants visible to group members" ON public.participants;
DROP POLICY IF EXISTS "Charges visible to group members" ON public.charges;
DROP POLICY IF EXISTS "Provider configs visible to group members" ON public.payment_provider_configs;
DROP POLICY IF EXISTS "Payment events visible to group members" ON public.payment_events;

CREATE POLICY "Members manage memberships of own groups"
ON public.group_members
FOR ALL
TO authenticated
USING (app_private.is_group_member(group_id, auth.uid()))
WITH CHECK (app_private.is_group_member(group_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Members see their memberships"
ON public.group_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR app_private.is_group_member(group_id, auth.uid()));

CREATE POLICY "View groups I'm member of"
ON public.groups
FOR SELECT
TO authenticated
USING (app_private.is_group_member(id, auth.uid()));

CREATE POLICY "Update own groups"
ON public.groups
FOR UPDATE
TO authenticated
USING (app_private.is_group_member(id, auth.uid()));

CREATE POLICY "Participants visible to group members"
ON public.participants
FOR ALL
TO authenticated
USING (app_private.is_group_member(group_id, auth.uid()))
WITH CHECK (app_private.is_group_member(group_id, auth.uid()));

CREATE POLICY "Charges visible to group members"
ON public.charges
FOR ALL
TO authenticated
USING (app_private.is_group_member(group_id, auth.uid()))
WITH CHECK (app_private.is_group_member(group_id, auth.uid()));

CREATE POLICY "Provider configs visible to group members"
ON public.payment_provider_configs
FOR ALL
TO authenticated
USING (app_private.is_group_member(group_id, auth.uid()))
WITH CHECK (app_private.is_group_member(group_id, auth.uid()));

DO $$
BEGIN
  IF to_regclass('public.payment_events') IS NOT NULL THEN
    CREATE POLICY "Payment events visible to group members"
    ON public.payment_events
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.charges c
        WHERE c.id = payment_events.charge_id
          AND app_private.is_group_member(c.group_id, auth.uid())
      )
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_group() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;