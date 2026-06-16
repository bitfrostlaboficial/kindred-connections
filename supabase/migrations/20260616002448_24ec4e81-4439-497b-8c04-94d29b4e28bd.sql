
-- Function: request join via token, respecting join_mode
CREATE OR REPLACE FUNCTION public.request_join_by_token(_token text)
RETURNS TABLE(status text, group_id uuid, participant_id uuid, request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _gid uuid;
  _mode text;
  _pid uuid;
  _rid uuid;
  _name text;
  _phone text;
  _pos text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT g.id, g.join_mode INTO _gid, _mode FROM public.groups g WHERE g.invite_token = _token;
  IF _gid IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  SELECT id INTO _pid FROM public.participants WHERE participants.group_id = _gid AND participants.user_id = _uid LIMIT 1;
  IF _pid IS NOT NULL THEN
    RETURN QUERY SELECT 'already_member'::text, _gid, _pid, NULL::uuid; RETURN;
  END IF;

  IF _mode = 'invite_only' THEN
    RETURN QUERY SELECT 'invite_only'::text, _gid, NULL::uuid, NULL::uuid; RETURN;
  END IF;

  IF _mode = 'approval' THEN
    SELECT id INTO _rid FROM public.group_join_requests
      WHERE group_join_requests.group_id = _gid AND group_join_requests.user_id = _uid AND status = 'pending' LIMIT 1;
    IF _rid IS NULL THEN
      INSERT INTO public.group_join_requests (group_id, user_id, status)
      VALUES (_gid, _uid, 'pending') RETURNING id INTO _rid;
    END IF;
    RETURN QUERY SELECT 'pending'::text, _gid, NULL::uuid, _rid; RETURN;
  END IF;

  -- public: join immediately
  SELECT full_name, phone, preferred_position INTO _name, _phone, _pos FROM public.profiles WHERE id = _uid;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email,'@',1))
      INTO _name FROM auth.users WHERE id = _uid;
  END IF;
  INSERT INTO public.participants (group_id, user_id, name, phone, position, type, is_active)
  VALUES (_gid, _uid, COALESCE(_name,'Jogador'), _phone, _pos, 'mensalista', true) RETURNING id INTO _pid;
  RETURN QUERY SELECT 'joined'::text, _gid, _pid, NULL::uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_join_by_token(text) TO authenticated;

-- Function: organizer reviews a join request
CREATE OR REPLACE FUNCTION public.review_join_request(_request_id uuid, _approve boolean)
RETURNS TABLE(status text, participant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _gid uuid;
  _req_user uuid;
  _owner uuid;
  _pid uuid;
  _name text;
  _phone text;
  _pos text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT group_id, user_id INTO _gid, _req_user FROM public.group_join_requests WHERE id = _request_id;
  IF _gid IS NULL THEN RAISE EXCEPTION 'request not found'; END IF;
  SELECT created_by INTO _owner FROM public.groups WHERE id = _gid;
  IF _owner <> _uid THEN RAISE EXCEPTION 'not group owner'; END IF;

  IF _approve THEN
    SELECT id INTO _pid FROM public.participants WHERE group_id = _gid AND user_id = _req_user LIMIT 1;
    IF _pid IS NULL THEN
      SELECT full_name, phone, preferred_position INTO _name, _phone, _pos FROM public.profiles WHERE id = _req_user;
      IF _name IS NULL OR length(trim(_name)) = 0 THEN
        SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email,'@',1))
          INTO _name FROM auth.users WHERE id = _req_user;
      END IF;
      INSERT INTO public.participants (group_id, user_id, name, phone, position, type, is_active)
      VALUES (_gid, _req_user, COALESCE(_name,'Jogador'), _phone, _pos, 'mensalista', true) RETURNING id INTO _pid;
    END IF;
    UPDATE public.group_join_requests SET status='approved', reviewed_at=now(), reviewed_by=_uid WHERE id=_request_id;
    RETURN QUERY SELECT 'approved'::text, _pid;
  ELSE
    UPDATE public.group_join_requests SET status='rejected', reviewed_at=now(), reviewed_by=_uid WHERE id=_request_id;
    RETURN QUERY SELECT 'rejected'::text, NULL::uuid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_join_request(uuid, boolean) TO authenticated;
