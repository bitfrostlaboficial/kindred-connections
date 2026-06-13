
ALTER TABLE public.charges
  ADD COLUMN IF NOT EXISTS payment_intent_id text,
  ADD COLUMN IF NOT EXISTS client_secret text;
