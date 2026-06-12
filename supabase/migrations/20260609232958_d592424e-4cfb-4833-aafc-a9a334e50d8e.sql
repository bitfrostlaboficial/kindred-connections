DROP POLICY "View groups I'm member of" ON public.groups;
CREATE POLICY "View own or member groups"
ON public.groups
FOR SELECT
TO authenticated
USING (created_by = auth.uid() OR app_private.is_group_member(id, auth.uid()));

DROP POLICY "Update own groups" ON public.groups;
CREATE POLICY "Update own or member groups"
ON public.groups
FOR UPDATE
TO authenticated
USING (created_by = auth.uid() OR app_private.is_group_member(id, auth.uid()));