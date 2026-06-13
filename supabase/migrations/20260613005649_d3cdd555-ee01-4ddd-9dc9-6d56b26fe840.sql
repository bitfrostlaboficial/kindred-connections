
-- 1. Create payment_accounts table (stores OAuth tokens per user/provider)
CREATE TABLE IF NOT EXISTS public.payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_user_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  public_key text,
  expires_at timestamptz,
  scope text,
  is_active boolean NOT NULL DEFAULT true,
  account_label text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, external_user_id)
);

GRANT SELECT ON public.payment_accounts TO authenticated;
GRANT ALL ON public.payment_accounts TO service_role;

ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read own payment accounts"
  ON public.payment_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. Add payment_account_id column to payment_provider_configs
ALTER TABLE public.payment_provider_configs
  ADD COLUMN IF NOT EXISTS payment_account_id uuid REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ppc_payment_account_id
  ON public.payment_provider_configs(payment_account_id);

-- 3. updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_payment_accounts_updated ON public.payment_accounts;
CREATE TRIGGER trg_payment_accounts_updated
  BEFORE UPDATE ON public.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
