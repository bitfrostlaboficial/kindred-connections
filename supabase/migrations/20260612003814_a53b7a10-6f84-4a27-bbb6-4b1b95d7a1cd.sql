CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID, _user_id UUID) RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS(SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id); $$;

CREATE POLICY "Profiles are viewable by owner" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "View groups I'm member of" ON public.groups FOR SELECT TO authenticated USING (public.is_group_member(id, auth.uid()));
CREATE POLICY "Create groups as myself" ON public.groups FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Update own groups" ON public.groups FOR UPDATE TO authenticated USING (public.is_group_member(id, auth.uid()));
CREATE POLICY "Delete own groups" ON public.groups FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "Members see their memberships" ON public.group_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_group_member(group_id, auth.uid()));
CREATE POLICY "Members manage memberships of own groups" ON public.group_members FOR ALL TO authenticated USING (public.is_group_member(group_id, auth.uid())) WITH CHECK (public.is_group_member(group_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Manage participants of own groups" ON public.participants FOR ALL TO authenticated USING (public.is_group_member(group_id, auth.uid())) WITH CHECK (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Manage configs of own groups" ON public.payment_provider_configs FOR ALL TO authenticated USING (public.is_group_member(group_id, auth.uid())) WITH CHECK (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Members manage charges of own groups" ON public.charges FOR ALL TO authenticated USING (public.is_group_member(group_id, auth.uid())) WITH CHECK (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "Public can view charge for payment" ON public.charges FOR SELECT TO anon USING (true);

CREATE POLICY "Members view events of own groups" ON public.payment_events FOR SELECT TO authenticated USING (charge_id IS NULL OR EXISTS (SELECT 1 FROM public.charges c WHERE c.id = charge_id AND public.is_group_member(c.group_id, auth.uid())));

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN INSERT INTO public.profiles (id, full_name, avatar_url) VALUES ( NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,''), '@', 1)), NEW.raw_user_meta_data->>'avatar_url' ) ON CONFLICT (id) DO NOTHING; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_group() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN INSERT INTO public.group_members (group_id, user_id, role) VALUES (NEW.id, NEW.created_by, 'owner'); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_group_created ON public.groups;
CREATE TRIGGER on_group_created AFTER INSERT ON public.groups FOR EACH ROW EXECUTE FUNCTION public.handle_new_group();
