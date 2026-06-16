-- Add cover image to groups
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS cover_image_url text;

-- Fields (campos / locais de jogo)
CREATE TABLE IF NOT EXISTS public.fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  maps_url text,
  photo_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fields TO authenticated;
GRANT ALL ON public.fields TO service_role;
ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view fields"
  ON public.fields FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Owners manage fields"
  ON public.fields FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = fields.group_id AND g.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = fields.group_id AND g.created_by = auth.uid()));

CREATE TRIGGER fields_touch_updated_at BEFORE UPDATE ON public.fields
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Group games (próximos jogos / partidas)
CREATE TABLE IF NOT EXISTS public.group_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  field_id uuid REFERENCES public.fields(id) ON DELETE SET NULL,
  title text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes int DEFAULT 90,
  notes text,
  status text NOT NULL DEFAULT 'scheduled',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_games TO authenticated;
GRANT ALL ON public.group_games TO service_role;
ALTER TABLE public.group_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view games"
  ON public.group_games FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Owners manage games"
  ON public.group_games FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_games.group_id AND g.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_games.group_id AND g.created_by = auth.uid()));

CREATE TRIGGER group_games_touch_updated_at BEFORE UPDATE ON public.group_games
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_group_games_group_scheduled ON public.group_games(group_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_fields_group ON public.fields(group_id);