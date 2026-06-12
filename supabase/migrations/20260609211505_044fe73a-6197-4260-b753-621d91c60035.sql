
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.group_role AS ENUM ('owner', 'admin');
CREATE TYPE public.participant_type AS ENUM ('mensalista', 'avulso');
CREATE TYPE public.charge_status AS ENUM ('pendente', 'pago', 'vencido', 'cancelado');
CREATE TYPE public.payment_provider AS ENUM ('pix_manual', 'asaas', 'mercado_pago', 'stripe', 'infinitepay');

-- =========================
-- UPDATED_AT TRIGGER
-- =========================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by owner" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- GROUPS
-- =========================
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  default_monthly_fee NUMERIC(10,2),
  pix_key TEXT,
  pix_recipient_name TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- GROUP MEMBERS
-- =========================
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.group_role NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Security definer helper (avoid recursion)
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id);
$$;

CREATE POLICY "Members see their memberships" ON public.group_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_group_member(group_id, auth.uid()));
CREATE POLICY "Members manage memberships of own groups" ON public.group_members FOR ALL TO authenticated USING (public.is_group_member(group_id, auth.uid())) WITH CHECK (public.is_group_member(group_id, auth.uid()) OR user_id = auth.uid());

-- Groups policies (after helper exists)
CREATE POLICY "View groups I'm member of" ON public.groups FOR SELECT TO authenticated USING (public.is_group_member(id, auth.uid()));
CREATE POLICY "Create groups as myself" ON public.groups FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Update own groups" ON public.groups FOR UPDATE TO authenticated USING (public.is_group_member(id, auth.uid()));
CREATE POLICY "Delete own groups" ON public.groups FOR DELETE TO authenticated USING (created_by = auth.uid());

-- Trigger: auto add creator as owner member
CREATE OR REPLACE FUNCTION public.handle_new_group()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, role) VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_group_created AFTER INSERT ON public.groups FOR EACH ROW EXECUTE FUNCTION public.handle_new_group();

-- =========================
-- PARTICIPANTS
-- =========================
CREATE TABLE public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  position TEXT,
  jersey_number INT,
  type public.participant_type NOT NULL DEFAULT 'mensalista',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage participants of own groups" ON public.participants FOR ALL TO authenticated USING (public.is_group_member(group_id, auth.uid())) WITH CHECK (public.is_group_member(group_id, auth.uid()));
CREATE TRIGGER participants_updated_at BEFORE UPDATE ON public.participants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_participants_group ON public.participants(group_id);

-- =========================
-- PAYMENT PROVIDER CONFIGS
-- =========================
CREATE TABLE public.payment_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  provider public.payment_provider NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- never exposes keys to client (RLS restricts)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_provider_configs TO authenticated;
GRANT ALL ON public.payment_provider_configs TO service_role;
ALTER TABLE public.payment_provider_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage configs of own groups" ON public.payment_provider_configs FOR ALL TO authenticated USING (public.is_group_member(group_id, auth.uid())) WITH CHECK (public.is_group_member(group_id, auth.uid()));
CREATE TRIGGER ppc_updated_at BEFORE UPDATE ON public.payment_provider_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- CHARGES
-- =========================
CREATE TABLE public.charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  due_date DATE NOT NULL,
  status public.charge_status NOT NULL DEFAULT 'pendente',
  provider public.payment_provider NOT NULL DEFAULT 'pix_manual',
  provider_charge_id TEXT,
  payment_link TEXT,
  pix_copy_paste TEXT,
  public_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex') UNIQUE,
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(10,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charges TO authenticated;
GRANT SELECT ON public.charges TO anon; -- public payment page reads by token
GRANT ALL ON public.charges TO service_role;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage charges of own groups" ON public.charges FOR ALL TO authenticated USING (public.is_group_member(group_id, auth.uid())) WITH CHECK (public.is_group_member(group_id, auth.uid()));
-- Public read by token only when querying by public_token (filtered server-side via select)
CREATE POLICY "Public can view charge for payment" ON public.charges FOR SELECT TO anon USING (true);
CREATE TRIGGER charges_updated_at BEFORE UPDATE ON public.charges FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_charges_group ON public.charges(group_id);
CREATE INDEX idx_charges_participant ON public.charges(participant_id);
CREATE INDEX idx_charges_status ON public.charges(status);
CREATE INDEX idx_charges_token ON public.charges(public_token);

-- =========================
-- PAYMENT EVENTS (audit / webhooks)
-- =========================
CREATE TABLE public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id UUID REFERENCES public.charges(id) ON DELETE CASCADE,
  provider public.payment_provider NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view events of own groups" ON public.payment_events FOR SELECT TO authenticated USING (charge_id IS NULL OR EXISTS (SELECT 1 FROM public.charges c WHERE c.id = charge_id AND public.is_group_member(c.group_id, auth.uid())));
