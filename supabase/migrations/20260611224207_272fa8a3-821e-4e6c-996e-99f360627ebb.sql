
-- payment_accounts: cada organizador conecta sua(s) conta(s) de gateway
CREATE TABLE public.payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.payment_provider NOT NULL,
  account_label text,
  external_user_id text,         -- ex: mp user_id
  access_token text NOT NULL,
  refresh_token text,
  public_key text,
  expires_at timestamptz,
  scope text,
  is_active boolean NOT NULL DEFAULT true,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider, external_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_accounts TO authenticated;
GRANT ALL ON public.payment_accounts TO service_role;

ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own payment accounts"
  ON public.payment_accounts
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER payment_accounts_updated_at
  BEFORE UPDATE ON public.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_payment_accounts_user ON public.payment_accounts(user_id);
CREATE INDEX idx_payment_accounts_provider ON public.payment_accounts(provider);

-- Liga config do grupo à conta de pagamento do organizador
ALTER TABLE public.payment_provider_configs
  ADD COLUMN payment_account_id uuid REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

CREATE INDEX idx_ppc_payment_account ON public.payment_provider_configs(payment_account_id);
