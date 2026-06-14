
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS participants_user_id_idx ON public.participants(user_id);

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS invite_token text UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '');
UPDATE public.groups SET invite_token = replace(gen_random_uuid()::text, '-', '') WHERE invite_token IS NULL;

-- Player: see own participant rows
CREATE POLICY "Players view own participant rows"
ON public.participants FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Player: claim a participant row (link to self) when unclaimed
CREATE POLICY "Players claim participant rows"
ON public.participants FOR UPDATE
TO authenticated
USING (user_id IS NULL)
WITH CHECK (user_id = auth.uid());

-- Player: see groups they belong to via participants
CREATE POLICY "Players view their groups"
ON public.groups FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.participants p WHERE p.group_id = groups.id AND p.user_id = auth.uid()));

-- Player: see groups by invite token (to claim)
CREATE POLICY "View group by invite token"
ON public.groups FOR SELECT
TO authenticated
USING (true);

-- Player: see own charges
CREATE POLICY "Players view own charges"
ON public.charges FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.participants p WHERE p.id = charges.participant_id AND p.user_id = auth.uid()));
