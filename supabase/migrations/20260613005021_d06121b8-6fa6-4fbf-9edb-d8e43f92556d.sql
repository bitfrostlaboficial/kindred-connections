
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;
REVOKE ALL ON FUNCTION app_private.is_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_group_member(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_private.is_group_member(_group_id, _user_id);
$$;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_group()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_group() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_group() TO service_role;

DROP TRIGGER IF EXISTS on_group_created ON public.groups;
CREATE TRIGGER on_group_created
  AFTER INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_group();

DROP POLICY IF EXISTS "View groups I'm member of" ON public.groups;
DROP POLICY IF EXISTS "View own or member groups" ON public.groups;
CREATE POLICY "View own or member groups" ON public.groups
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_group_member(id, auth.uid()));

DROP POLICY IF EXISTS "Update own groups" ON public.groups;
DROP POLICY IF EXISTS "Update own or member groups" ON public.groups;
CREATE POLICY "Update own or member groups" ON public.groups
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_group_member(id, auth.uid()));
