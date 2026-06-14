
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS join_mode text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS group_link text,
  ADD COLUMN IF NOT EXISTS group_link_label text,
  ADD COLUMN IF NOT EXISTS group_link_access text NOT NULL DEFAULT 'public';

ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_join_mode_check,
  ADD CONSTRAINT groups_join_mode_check CHECK (join_mode IN ('public','approval','invite_only'));

ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_group_link_access_check,
  ADD CONSTRAINT groups_group_link_access_check CHECK (group_link_access IN ('public','approval','private'));

CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_join_requests_status_check CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT group_join_requests_unique UNIQUE (group_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_join_requests TO authenticated;
GRANT ALL ON public.group_join_requests TO service_role;

ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own requests" ON public.group_join_requests;
CREATE POLICY "Users see own requests" ON public.group_join_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners see group requests" ON public.group_join_requests;
CREATE POLICY "Owners see group requests" ON public.group_join_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.created_by = auth.uid()));

DROP POLICY IF EXISTS "Users create own requests" ON public.group_join_requests;
CREATE POLICY "Users create own requests" ON public.group_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners update group requests" ON public.group_join_requests;
CREATE POLICY "Owners update group requests" ON public.group_join_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.created_by = auth.uid()));

DROP TRIGGER IF EXISTS update_group_join_requests_updated_at ON public.group_join_requests;
CREATE TRIGGER update_group_join_requests_updated_at
  BEFORE UPDATE ON public.group_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
