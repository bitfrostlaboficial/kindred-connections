
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS preferred_position text;

CREATE OR REPLACE FUNCTION public.join_group_by_token(_token text)
RETURNS TABLE(group_id uuid, participant_id uuid, already_member boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _gid uuid;
  _pid uuid;
  _name text;
  _phone text;
  _pos text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT id INTO _gid FROM public.groups WHERE invite_token = _token;
  IF _gid IS NULL THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  -- Already linked?
  SELECT id INTO _pid FROM public.participants
    WHERE participants.group_id = _gid AND participants.user_id = _uid
    LIMIT 1;
  IF _pid IS NOT NULL THEN
    RETURN QUERY SELECT _gid, _pid, true;
    RETURN;
  END IF;

  SELECT full_name, phone, preferred_position
    INTO _name, _phone, _pos
    FROM public.profiles WHERE id = _uid;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email,'@',1))
      INTO _name FROM auth.users WHERE id = _uid;
  END IF;

  INSERT INTO public.participants (group_id, user_id, name, phone, position, type, is_active)
  VALUES (_gid, _uid, COALESCE(_name, 'Jogador'), _phone, _pos, 'mensalista', true)
  RETURNING id INTO _pid;

  RETURN QUERY SELECT _gid, _pid, false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_group_by_token(text) TO authenticated;
