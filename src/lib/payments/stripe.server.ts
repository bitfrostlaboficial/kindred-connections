// Server-only Stripe client. Never import from client code.
// Uses fetch + form-encoded body (Stripe REST). No SDK = Worker-safe.

const STRIPE_API = "https://api.stripe.com/v1";

function form(body: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    p.append(k, String(v));
  }
  return p.toString();
}

export interface StripeCreatePIInput {
  secretKey: string;
  amount: number; // BRL major units
  description: string;
  externalId: string; // charges.id — idempotency + metadata
  payerEmail?: string;
}

export interface StripeCreatePIResult {
  providerChargeId: string; // pi_xxx
  clientSecret: string;
  status: string;
}

export async function stripeCreatePaymentIntent(
  input: StripeCreatePIInput,
): Promise<StripeCreatePIResult> {
  if (!input.secretKey) throw new Error("Secret Key da Stripe ausente");
  const res = await fetch(`${STRIPE_API}/payment_intents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `pi_${input.externalId}`,
    },
    body: form({
      amount: Math.round(input.amount * 100),
      currency: "brl",
      description: input.description,
      "automatic_payment_methods[enabled]": "true",
      "metadata[external_id]": input.externalId,
      receipt_email: input.payerEmail,
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[Stripe] PI_CREATE_FAIL", res.status, json);
    throw new Error(json?.error?.message ?? `Stripe ${res.status}`);
  }
  return {
    providerChargeId: json.id,
    clientSecret: json.client_secret,
    status: json.status,
  };
}

export async function stripeGetPaymentIntent(secretKey: string, id: string) {
  const res = await fetch(`${STRIPE_API}/payment_intents/${id}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe ${res.status}`);
  return json;
}

export function mapStripeStatus(s: string): "pendente" | "pago" | "cancelado" {
  if (s === "succeeded") return "pago";
  if (s === "canceled") return "cancelado";
  return "pendente";
}

// Verify Stripe-Signature header per Stripe spec.
// header format: "t=<ts>,v1=<sig>[,v1=<sig>...]"
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  ) as Record<string, string>;
  const ts = parts.t;
  const v1 = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  if (!ts || v1.length === 0) return false;
  const payload = `${ts}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const ageOk = Math.abs(Date.now() / 1000 - Number(ts)) <= toleranceSec;
  return ageOk && v1.some((s) => timingSafeEq(s, expected));
}

function timingSafeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
